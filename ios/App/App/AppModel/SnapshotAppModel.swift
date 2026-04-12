import Combine
import Foundation
import SwiftUI
import UIKit
import AuthenticationServices

enum AnalysisStage: Equatable {
    case idle
    case authenticating
    case uploading
    case analyzing
    case saving

    var title: String {
        switch self {
        case .idle:
            return "Ready"
        case .authenticating:
            return "Signing in"
        case .uploading:
            return "Uploading image"
        case .analyzing:
            return "Analyzing image"
        case .saving:
            return "Saving card"
        }
    }

    var detail: String {
        switch self {
        case .idle:
            return "Select an image, then run a full native upload and analysis cycle."
        case .authenticating:
            return "Waiting for Apple identity and backend session creation."
        case .uploading:
            return "Sending the selected image to your backend."
        case .analyzing:
            return "Generating the vocabulary card from the uploaded image."
        case .saving:
            return "Persisting the generated card into synced history."
        }
    }

    var systemImage: String {
        switch self {
        case .idle:
            return "bolt.badge.checkmark"
        case .authenticating:
            return "person.badge.key"
        case .uploading:
            return "arrow.up.circle"
        case .analyzing:
            return "sparkles.rectangle.stack"
        case .saving:
            return "square.and.arrow.down"
        }
    }
}

@MainActor
final class SnapshotAppModel: ObservableObject {
    @Published var selectedImage: UIImage?
    @Published var latestAnalysis: AnalyzeResponse?
    @Published var history: [HistoryCard] = []
    @Published var session: SessionState?
    @Published var errorMessage: String?
    @Published var statusMessage = "Connect Apple sign-in, then capture and analyze one image."
    @Published var isAuthenticating = false
    @Published var isAnalyzing = false
    @Published var activeStage: AnalysisStage = .idle
    @Published var isRefreshingHistory = false
    @Published var lastHistorySyncDescription = "History has not been refreshed yet."

    let apiClient: APIClient
    let storeKitRuntime: SnapshotStoreKitRuntime
    private let sessionStorageKey = "snapshot.session"
    private var cancellables = Set<AnyCancellable>()

    init(apiClient: APIClient = APIClient()) {
        self.apiClient = apiClient
        self.storeKitRuntime = SnapshotStoreKitRuntime()

        storeKitRuntime.objectWillChange
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)

        restoreSession()
        Task {
            await storeKitRuntime.bootstrap()
        }
    }

    var isSignedIn: Bool {
        session != nil
    }

    var currentUsername: String {
        session?.user.username ?? session?.user.email ?? "Not signed in"
    }

    var subscriptionLabel: String {
        storeKitRuntime.subscriptionSurfaceSubtitle
    }

    var isBusy: Bool {
        isAuthenticating || isAnalyzing
    }

    func signOut() {
        session = nil
        history = []
        latestAnalysis = nil
        selectedImage = nil
        activeStage = .idle
        statusMessage = "Signed out. Use Sign in with Apple to start a fresh native session."
        UserDefaults.standard.removeObject(forKey: sessionStorageKey)
    }

    func handleAppleSignIn(result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let error):
            errorMessage = error.localizedDescription
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let identityTokenData = credential.identityToken,
                  let identityToken = String(data: identityTokenData, encoding: .utf8) else {
                errorMessage = "Apple sign-in did not provide a usable identity token."
                return
            }

            let formatter = PersonNameComponentsFormatter()
            let fullName = formatter.string(from: credential.fullName ?? PersonNameComponents())
            Task {
                await authenticate(identityToken: identityToken, fullName: fullName.isEmpty ? nil : fullName)
            }
        }
    }

    func analyzeSelectedImage() {
        guard let session, let image = selectedImage else {
            errorMessage = "Select an image and sign in before starting analysis."
            return
        }

        Task {
            await runAnalysis(session: session, image: image)
        }
    }

    func beginPicking(_ source: ImagePickerSource, onReady: (ImagePickerSource) -> Void) {
        if source == .camera, !UIImagePickerController.isSourceTypeAvailable(.camera) {
            errorMessage = APIError.cameraUnavailable.localizedDescription
            return
        }

        onReady(source)
    }

    func refreshHistory() {
        guard let session else { return }
        Task {
            await loadHistory(session: session)
        }
    }

    func deleteHistoryCard(_ card: HistoryCard) {
        guard let session else { return }
        Task {
            do {
                try await apiClient.deleteHistory(session: session, id: card.id)
                history.removeAll { $0.id == card.id }
                statusMessage = "Deleted one study card from history."
            } catch {
                handle(error)
            }
        }
    }

    private func restoreSession() {
        guard let data = UserDefaults.standard.data(forKey: sessionStorageKey),
              let session = try? JSONDecoder().decode(SessionState.self, from: data) else {
            return
        }

        guard session.expiresAt > Date().timeIntervalSince1970 else {
            UserDefaults.standard.removeObject(forKey: sessionStorageKey)
            statusMessage = "Saved session expired. Sign in again to continue."
            return
        }

        self.session = session
        statusMessage = "Restored a saved session. History can be refreshed from the server."
        refreshHistory()
    }

    private func persistSession(_ session: SessionState) {
        self.session = session
        if let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: sessionStorageKey)
        }
    }

    private func authenticate(identityToken: String, fullName: String?) async {
        isAuthenticating = true
        errorMessage = nil
        activeStage = .authenticating
        defer {
            isAuthenticating = false
            if !isAnalyzing {
                activeStage = .idle
            }
        }

        do {
            let session = try await apiClient.signInWithApple(identityToken: identityToken, fullName: fullName)
            persistSession(session)
            statusMessage = "Signed in as \(session.user.email). Native API session is ready."
            await loadHistory(session: session)
        } catch {
            handle(error)
        }
    }

    private func runAnalysis(session: SessionState, image: UIImage) async {
        isAnalyzing = true
        errorMessage = nil
        latestAnalysis = nil
        defer {
            isAnalyzing = false
            activeStage = .idle
        }

        guard let imageData = image.jpegData(compressionQuality: 0.85) else {
            errorMessage = APIError.imagePreparationFailed.localizedDescription
            return
        }

        do {
            activeStage = .uploading
            statusMessage = "Uploading image..."
            let imageURL = try await apiClient.uploadImage(
                session: session,
                imageData: imageData,
                fileName: "snapshot-\(UUID().uuidString).jpg"
            )

            activeStage = .analyzing
            statusMessage = "Running analysis..."
            let analysis = try await apiClient.analyzeImage(session: session, imageURL: imageURL)
            latestAnalysis = analysis

            activeStage = .saving
            statusMessage = "Saving study card..."
            try await apiClient.saveHistory(session: session, analysis: analysis, imageURL: imageURL)

            statusMessage = "Study card saved to history."
            await loadHistory(session: session)
        } catch {
            handle(error)
        }
    }

    private func loadHistory(session: SessionState) async {
        isRefreshingHistory = true
        defer { isRefreshingHistory = false }

        do {
            history = try await apiClient.fetchHistory(session: session)
            if let latest = history.first {
                lastHistorySyncDescription = "Latest card: \(latest.title) at \(latest.createdAt.formatted(date: .abbreviated, time: .shortened))"
            } else {
                lastHistorySyncDescription = "History is empty. Analyze one image to create the first saved card."
            }
        } catch {
            handle(error)
        }
    }

    private func handle(_ error: Error) {
        if case APIError.unauthorized = error {
            signOut()
        }

        errorMessage = error.localizedDescription
    }
}
