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
    @Published var trainingCards: [NativeTrainingCard] = []
    @Published var session: SessionState?
    @Published var nativeUserProfile: NativeUserProfile?
    @Published var billingStatus: NativeBillingStatus?
    @Published var errorMessage: String?
    @Published var statusMessage = "Connect Apple sign-in, then capture and analyze one image."
    @Published var isAuthenticating = false
    @Published var isAnalyzing = false
    @Published var activeStage: AnalysisStage = .idle
    @Published var isRefreshingHistory = false
    @Published var isRefreshingTrainingDeck = false
    @Published var lastHistorySyncDescription = "History has not been refreshed yet."
    @Published var lastTrainingSyncDescription = "Training deck has not been refreshed yet."
    @Published var historyTotalCount = 0
    @Published var historyRecentCount = 0
    @Published var isHistoryPreview = true

    let apiClient: APIClient
    private let sessionStorageKey = "snapshot.session"
    private let bootstrapHistoryLimit = 5
    private let trainingFeedLimit = 12

    init(apiClient: APIClient = APIClient()) {
        self.apiClient = apiClient
        restoreSession()
    }

    var isSignedIn: Bool {
        session != nil
    }

    var currentUsername: String {
        nativeUserProfile?.username ?? session?.user.username ?? nativeUserProfile?.email ?? session?.user.email ?? "Not signed in"
    }

    var subscriptionLabel: String {
        guard let billingStatus else {
            return "Billing snapshot has not loaded yet."
        }

        let sourceLabel: String
        switch billingStatus.source {
        case "app_store":
            sourceLabel = "App Store"
        case "stripe":
            sourceLabel = "Stripe"
        default:
            sourceLabel = "Free tier"
        }

        if billingStatus.source == "free" {
            return "\(sourceLabel) · \(billingStatus.remaining) analyzes remaining"
        }

        if billingStatus.subscriptionStatus == "trialing" {
            return "\(sourceLabel) trial · \(billingStatus.remaining) analyzes remaining"
        }

        if billingStatus.hasAccess {
            return "\(sourceLabel) active · \(billingStatus.remaining) analyzes remaining"
        }

        return "\(sourceLabel) inactive · \(billingStatus.remaining) analyzes remaining"
    }

    var accountSummaryLabel: String {
        guard let nativeUserProfile else {
            return "Native account snapshot will appear after bootstrap loads."
        }

        let provider = nativeUserProfile.authProvider?.uppercased() ?? "LOCAL"
        return "\(provider) account · \(nativeUserProfile.coins) coins"
    }

    var historySummaryLabel: String {
        if isRefreshingHistory {
            return "Loading native history snapshot..."
        }

        if isHistoryPreview && historyTotalCount > history.count {
            return "Showing the latest \(history.count) of \(historyTotalCount) saved cards."
        }

        return "Showing the full archive with \(history.count) cards."
    }

    var historyActionLabel: String {
        isHistoryPreview ? "Load Full Archive" : "Refresh Full Archive"
    }

    var isBusy: Bool {
        isAuthenticating || isAnalyzing
    }

    func signOut() {
        session = nil
        history = []
        trainingCards = []
        nativeUserProfile = nil
        billingStatus = nil
        latestAnalysis = nil
        selectedImage = nil
        activeStage = .idle
        statusMessage = "Signed out. Use Sign in with Apple to start a fresh native session."
        lastHistorySyncDescription = "History has not been refreshed yet."
        lastTrainingSyncDescription = "Training deck has not been refreshed yet."
        historyTotalCount = 0
        historyRecentCount = 0
        isHistoryPreview = true
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
        statusMessage = "Loading the full archive from the backend..."
        Task {
            await loadFullHistory(session: session)
            await loadTrainingDeck(session: session)
        }
    }

    func refreshTrainingDeck() {
        guard let session else { return }
        statusMessage = "Refreshing the compact training deck..."
        Task {
            await loadTrainingDeck(session: session)
        }
    }

    func deleteHistoryCard(_ card: HistoryCard) {
        guard let session else { return }
        Task {
            do {
                try await apiClient.deleteHistory(session: session, id: card.id)
                history.removeAll { $0.id == card.id }
                statusMessage = "Deleted one study card from history."
                await refreshSnapshotAfterMutation(session: session)
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
        statusMessage = "Restored a saved session. Loading native summary data."
        refreshCompactSnapshot()
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
            await loadCompactSnapshot(session: session)
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
            await refreshSnapshotAfterMutation(session: session)
        } catch {
            handle(error)
        }
    }

    private func refreshCompactSnapshot() {
        guard let session else { return }
        Task {
            await loadCompactSnapshot(session: session)
        }
    }

    private func loadCompactSnapshot(session: SessionState) async {
        isRefreshingHistory = true
        isRefreshingTrainingDeck = true
        statusMessage = "Loading native dashboard snapshot..."
        defer { isRefreshingHistory = false }
        defer { isRefreshingTrainingDeck = false }

        async let bootstrapTask = apiClient.fetchNativeBootstrap(session: session, historyLimit: bootstrapHistoryLimit)
        async let trainingTask = apiClient.fetchNativeTrainingFeed(session: session, limit: trainingFeedLimit)

        do {
            let bootstrap = try await bootstrapTask
            applyBootstrap(bootstrap)
        } catch {
            handle(error)
        }

        do {
            let training = try await trainingTask
            applyTrainingFeed(training)
        } catch {
            handle(error)
        }
    }

    private func loadFullHistory(session: SessionState) async {
        isRefreshingHistory = true
        defer { isRefreshingHistory = false }

        do {
            history = try await apiClient.fetchHistory(session: session)
            historyTotalCount = history.count
            historyRecentCount = history.count
            isHistoryPreview = false
            if let latest = history.first {
                lastHistorySyncDescription = "Latest card: \(latest.title) at \(latest.createdAt.formatted(date: .abbreviated, time: .shortened))"
            } else {
                lastHistorySyncDescription = "History is empty. Analyze one image to create the first saved card."
            }
            statusMessage = history.isEmpty
                ? "Loaded the full archive. No saved cards yet."
                : "Loaded the full archive with \(history.count) cards."
        } catch {
            handle(error)
        }
    }

    private func loadTrainingDeck(session: SessionState) async {
        isRefreshingTrainingDeck = true
        defer { isRefreshingTrainingDeck = false }

        do {
            let training = try await apiClient.fetchNativeTrainingFeed(session: session, limit: trainingFeedLimit)
            applyTrainingFeed(training)
        } catch {
            handle(error)
        }
    }

    private func refreshSnapshotAfterMutation(session: SessionState) async {
        if isHistoryPreview {
            await loadCompactSnapshot(session: session)
        } else {
            await loadFullHistory(session: session)
            await loadTrainingDeck(session: session)
        }
    }

    private func applyBootstrap(_ bootstrap: NativeBootstrapPayload) {
        nativeUserProfile = bootstrap.user
        billingStatus = bootstrap.billing
        history = bootstrap.history.recent.map(makeHistoryCard)
        historyTotalCount = bootstrap.history.totalCount
        historyRecentCount = bootstrap.history.recentCount
        isHistoryPreview = bootstrap.history.totalCount > bootstrap.history.recentCount

        if let latest = history.first {
            lastHistorySyncDescription = "Previewing \(history.count) recent cards from \(historyTotalCount) total. Latest card: \(latest.title) at \(latest.createdAt.formatted(date: .abbreviated, time: .shortened))"
        } else {
            lastHistorySyncDescription = "History is empty. Analyze one image to create the first saved card."
        }

        statusMessage = history.isEmpty
            ? "Loaded native dashboard snapshot. No cards have been saved yet."
            : "Loaded \(history.count) recent card\(history.count == 1 ? "" : "s") from native bootstrap."
    }

    private func applyTrainingFeed(_ training: NativeTrainingFeedPayload) {
        trainingCards = training.cards
        if let latest = training.cards.first {
            lastTrainingSyncDescription = "Training deck loaded with \(training.cards.count) cards. Latest prompt: \(latest.prompt)"
        } else {
            lastTrainingSyncDescription = "Training deck is empty. Save a few cards to start practicing."
        }
    }

    private func makeHistoryCard(from item: NativeHistorySummaryItem) -> HistoryCard {
        HistoryCard(
            id: item.id,
            title: item.word,
            phonetic: item.phonetic ?? "",
            meaning: item.meaning,
            example: item.sentence ?? "",
            exampleTranslation: item.sentenceCn ?? "",
            imageURL: item.imageURL,
            sourceObject: item.sourceObject ?? item.word,
            sourceLabelEn: item.sourceLabelEn ?? item.word,
            createdAt: parseDate(item.createdAt)
        )
    }

    private func parseDate(_ value: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }

        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value) ?? Date()
    }

    private func handle(_ error: Error) {
        if case APIError.unauthorized = error {
            signOut()
        }

        errorMessage = error.localizedDescription
    }
}
