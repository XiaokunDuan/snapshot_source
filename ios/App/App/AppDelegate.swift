import UIKit
import SwiftUI
import AuthenticationServices

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let rootView = SnapshotAppRootView()
        let hostingController = UIHostingController(rootView: rootView)

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = hostingController
        window.makeKeyAndVisible()
        self.window = window

        return true
    }
}

enum SnapshotConfig {
    static let apiBaseURL: URL = {
        let configured = Bundle.main.object(forInfoDictionaryKey: "SnapshotAPIBaseURL") as? String
        let rawValue = configured?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let rawValue, let url = URL(string: rawValue), !rawValue.isEmpty {
            return url
        }

        return URL(string: "https://yulu34.top")!
    }()
}

struct SessionUser: Codable {
    let id: Int
    let email: String
    let username: String?
    let avatarURL: String?

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case username
        case avatarURL = "avatarUrl"
    }
}

struct SessionState: Codable {
    let token: String
    let user: SessionUser
}

struct AnalyzeResponse: Codable {
    let sourceObject: String
    let sourceLabelEn: String
    let word: String
    let phonetic: String
    let meaning: String
    let sentence: String
    let sentenceCN: String

    enum CodingKeys: String, CodingKey {
        case sourceObject
        case sourceLabelEn
        case word
        case phonetic
        case meaning
        case sentence
        case sentenceCN = "sentence_cn"
    }
}

private struct AppleAuthRequest: Encodable {
    let identityToken: String
    let fullName: String
}

private struct AnalyzeRequest: Encodable {
    let imageUrl: String
    let primaryLanguage: String
    let targetLanguages: [String]
}

private struct SaveHistoryRequest: Encodable {
    let word: String
    let phonetic: String
    let meaning: String
    let sentence: String
    let sentence_cn: String
    let imageUrl: String
    let sourceObject: String
    let sourceLabelEn: String
    let primaryLanguage: String
    let targetLanguages: [String]
    let variantsJson: [String: String]
}

struct HistoryCard: Identifiable, Codable {
    let id: Int
    let title: String
    let phonetic: String
    let meaning: String
    let example: String
    let imageURL: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case phonetic
        case meaning
        case example
        case imageURL
        case createdAt
    }
}

private struct AuthResponse: Decodable {
    let sessionToken: String
    let user: SessionUser
}

private struct UploadResponse: Decodable {
    let success: Bool
    let url: String
}

private struct HistoryResponseItem: Decodable {
    let id: Int
    let word: String
    let phonetic: String?
    let meaning: String
    let sentence: String?
    let imageURL: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case word
        case phonetic
        case meaning
        case sentence
        case imageURL = "image_url"
        case createdAt = "created_at"
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The server returned an invalid response."
        case .server(let message):
            return message
        }
    }
}

struct APIClient {
    let baseURL: URL

    init(baseURL: URL = SnapshotConfig.apiBaseURL) {
        self.baseURL = baseURL
    }

    func signInWithApple(identityToken: String, fullName: String?) async throws -> SessionState {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/auth/apple"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(AppleAuthRequest(
            identityToken: identityToken,
            fullName: fullName ?? ""
        ))

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)

        let decoded = try JSONDecoder().decode(AuthResponse.self, from: data)
        return SessionState(token: decoded.sessionToken, user: decoded.user)
    }

    func uploadImage(session: SessionState, imageData: Data, fileName: String) async throws -> String {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = authorizedRequest(path: "api/upload", session: session)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".utf8Data)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".utf8Data)
        body.append("Content-Type: image/jpeg\r\n\r\n".utf8Data)
        body.append(imageData)
        body.append("\r\n--\(boundary)--\r\n".utf8Data)

        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)

        let decoded = try JSONDecoder().decode(UploadResponse.self, from: data)
        return decoded.url
    }

    func analyzeImage(session: SessionState, imageURL: String) async throws -> AnalyzeResponse {
        var request = authorizedRequest(path: "api/analyze", session: session)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(AnalyzeRequest(
            imageUrl: imageURL,
            primaryLanguage: "en",
            targetLanguages: ["en", "zh-CN"]
        ))

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return try JSONDecoder().decode(AnalyzeResponse.self, from: data)
    }

    func saveHistory(session: SessionState, analysis: AnalyzeResponse, imageURL: String) async throws {
        var request = authorizedRequest(path: "api/history", session: session)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(SaveHistoryRequest(
            word: analysis.word,
            phonetic: analysis.phonetic,
            meaning: analysis.meaning,
            sentence: analysis.sentence,
            sentence_cn: analysis.sentenceCN,
            imageUrl: imageURL,
            sourceObject: analysis.sourceObject,
            sourceLabelEn: analysis.sourceLabelEn,
            primaryLanguage: "en",
            targetLanguages: ["en", "zh-CN"],
            variantsJson: [:]
        ))

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
    }

    func fetchHistory(session: SessionState) async throws -> [HistoryCard] {
        let request = authorizedRequest(path: "api/history", session: session)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)

        let decoder = JSONDecoder()
        let items = try decoder.decode([HistoryResponseItem].self, from: data)
        let formatter = ISO8601DateFormatter()
        return items.map { item in
            HistoryCard(
                id: item.id,
                title: item.word,
                phonetic: item.phonetic ?? "",
                meaning: item.meaning,
                example: item.sentence ?? "",
                imageURL: item.imageURL,
                createdAt: formatter.date(from: item.createdAt) ?? Date()
            )
        }
    }

    private func authorizedRequest(path: String, session: SessionState) -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = payload["error"] as? String {
                throw APIError.server(message)
            }

            throw APIError.server("Request failed with status \(httpResponse.statusCode)")
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

    let apiClient: APIClient
    private let sessionStorageKey = "snapshot.session"

    init(apiClient: APIClient = APIClient()) {
        self.apiClient = apiClient
        restoreSession()
    }

    var isSignedIn: Bool {
        session != nil
    }

    var currentUsername: String {
        session?.user.username ?? session?.user.email ?? "Not signed in"
    }

    var subscriptionLabel: String {
        "StoreKit migration pending"
    }

    func signOut() {
        session = nil
        history = []
        latestAnalysis = nil
        selectedImage = nil
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

    func refreshHistory() {
        guard let session else { return }
        Task {
            await loadHistory(session: session)
        }
    }

    private func restoreSession() {
        guard let data = UserDefaults.standard.data(forKey: sessionStorageKey),
              let session = try? JSONDecoder().decode(SessionState.self, from: data) else {
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
        defer { isAuthenticating = false }

        do {
            let session = try await apiClient.signInWithApple(identityToken: identityToken, fullName: fullName)
            persistSession(session)
            statusMessage = "Signed in as \(session.user.email). Native API session is ready."
            await loadHistory(session: session)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func runAnalysis(session: SessionState, image: UIImage) async {
        isAnalyzing = true
        errorMessage = nil
        latestAnalysis = nil
        defer { isAnalyzing = false }

        guard let imageData = image.jpegData(compressionQuality: 0.85) else {
            errorMessage = "Failed to prepare the selected image for upload."
            return
        }

        do {
            statusMessage = "Uploading image..."
            let imageURL = try await apiClient.uploadImage(
                session: session,
                imageData: imageData,
                fileName: "snapshot-\(UUID().uuidString).jpg"
            )

            statusMessage = "Running analysis..."
            let analysis = try await apiClient.analyzeImage(session: session, imageURL: imageURL)
            latestAnalysis = analysis

            statusMessage = "Saving study card..."
            try await apiClient.saveHistory(session: session, analysis: analysis, imageURL: imageURL)

            statusMessage = "Study card saved to history."
            await loadHistory(session: session)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadHistory(session: SessionState) async {
        do {
            history = try await apiClient.fetchHistory(session: session)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct SnapshotAppRootView: View {
    @StateObject private var model = SnapshotAppModel()

    var body: some View {
        TabView {
            HomeScreen()
                .tabItem {
                    Label("Capture", systemImage: "camera.viewfinder")
                }

            HistoryScreen()
                .tabItem {
                    Label("History", systemImage: "books.vertical")
                }

            TrainScreen()
                .tabItem {
                    Label("Train", systemImage: "rectangle.stack.badge.play")
                }

            ProfileScreen()
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle")
                }
        }
        .environmentObject(model)
        .tint(Color(red: 0.08, green: 0.36, blue: 0.27))
    }
}

struct HomeScreen: View {
    @EnvironmentObject private var model: SnapshotAppModel
    @State private var activePicker: ImagePickerSource?

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    statusBlock
                    pickerButtons
                    selectedImageSection
                    latestAnalysisSection
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Workspace")
        }
        .navigationViewStyle(.stack)
        .sheet(item: $activePicker) { source in
            ImagePicker(source: source) { image in
                model.selectedImage = image
            }
        }
        .alert("Request Failed", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Snapshot")
                .font(.largeTitle.bold())
            Text("Native iPhone and iPad workflow for sign-in, upload, analysis, and history sync.")
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }

    private var statusBlock: some View {
        FeatureBlock(
            title: model.isSignedIn ? "Signed in" : "Session required",
            subtitle: model.statusMessage,
            systemImage: model.isSignedIn ? "checkmark.shield" : "person.badge.key"
        )
    }

    private var pickerButtons: some View {
        VStack(spacing: 12) {
            Button {
                activePicker = .camera
            } label: {
                ActionRow(title: "Capture Photo", subtitle: "Use the camera as the native intake flow.", systemImage: "camera")
            }

            Button {
                activePicker = .photoLibrary
            } label: {
                ActionRow(title: "Choose from Library", subtitle: "Import an existing image before analysis.", systemImage: "photo.on.rectangle")
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var selectedImageSection: some View {
        if let image = model.selectedImage {
            VStack(alignment: .leading, spacing: 12) {
                Text("Selected image")
                    .font(.headline)
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                Button(model.isAnalyzing ? "Analyzing..." : "Upload and Analyze") {
                    model.analyzeSelectedImage()
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!model.isSignedIn || model.isAnalyzing)
            }
        }
    }

    @ViewBuilder
    private var latestAnalysisSection: some View {
        if let analysis = model.latestAnalysis {
            StudyCardView(
                title: "Latest Analysis",
                heading: analysis.word,
                phonetic: analysis.phonetic,
                meaning: analysis.meaning,
                example: analysis.sentence
            )
        }
    }
}

struct HistoryScreen: View {
    @EnvironmentObject private var model: SnapshotAppModel

    var body: some View {
        NavigationView {
            List {
                if model.history.isEmpty {
                    Section {
                        Text("No synced history yet. Sign in and analyze one image to populate this list.")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section("Archived Cards") {
                        ForEach(model.history) { card in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(card.title)
                                    .font(.headline)
                                if !card.phonetic.isEmpty {
                                    Text(card.phonetic)
                                        .font(.caption.monospaced())
                                        .foregroundStyle(.secondary)
                                }
                                Text(card.meaning)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                Text(card.createdAt.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .refreshable {
                model.refreshHistory()
            }
            .navigationTitle("History")
        }
        .navigationViewStyle(.stack)
    }
}

struct TrainScreen: View {
    @EnvironmentObject private var model: SnapshotAppModel
    @State private var currentIndex = 0

    var body: some View {
        NavigationView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Flashcard Training")
                    .font(.largeTitle.bold())

                if model.history.isEmpty {
                    FeatureBlock(
                        title: "No cards yet",
                        subtitle: "The training deck will become meaningful once the native analyze flow starts saving history.",
                        systemImage: "rectangle.stack.badge.plus"
                    )
                } else {
                    let card = model.history[min(currentIndex, max(model.history.count - 1, 0))]
                    StudyCardView(
                        title: "Review",
                        heading: card.title,
                        phonetic: card.phonetic,
                        meaning: card.meaning,
                        example: card.example
                    )

                    Button("Next Card") {
                        currentIndex = (currentIndex + 1) % model.history.count
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }

                Spacer()
            }
            .padding(20)
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Train")
        }
        .navigationViewStyle(.stack)
    }
}

struct ProfileScreen: View {
    @EnvironmentObject private var model: SnapshotAppModel

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Profile")
                            .font(.largeTitle.bold())
                        Text("This view now signs into your own backend session instead of relying on a browser-only flow.")
                            .foregroundStyle(.secondary)
                    }

                    FeatureBlock(
                        title: model.currentUsername,
                        subtitle: model.subscriptionLabel,
                        systemImage: "person.crop.circle.badge.checkmark"
                    )

                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        model.handleAppleSignIn(result: result)
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .disabled(model.isAuthenticating)

                    if model.isSignedIn {
                        Button("Sign Out") {
                            model.signOut()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Profile")
        }
        .navigationViewStyle(.stack)
    }
}

struct StudyCardView: View {
    let title: String
    let heading: String
    let phonetic: String
    let meaning: String
    let example: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
            VStack(alignment: .leading, spacing: 8) {
                Text(heading)
                    .font(.title2.bold())
                if !phonetic.isEmpty {
                    Text(phonetic)
                        .font(.subheadline.monospaced())
                        .foregroundStyle(.secondary)
                }
                Text(meaning)
                    .font(.body)
                if !example.isEmpty {
                    Text(example)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color(uiColor: .secondarySystemBackground))
        )
    }
}

struct FeatureBlock: View {
    let title: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(Color(red: 0.08, green: 0.36, blue: 0.27))
                .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.white)
        )
    }
}

struct ActionRow: View {
    let title: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.title3)
                .frame(width: 36, height: 36)
                .background(Color(red: 0.62, green: 0.91, blue: 0.44))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .foregroundStyle(.black)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundStyle(.tertiary)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
        )
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(red: 0.08, green: 0.36, blue: 0.27))
                    .opacity(configuration.isPressed ? 0.8 : 1)
            )
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white)
                    .opacity(configuration.isPressed ? 0.85 : 1)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.black.opacity(0.08), lineWidth: 1)
            )
    }
}

enum ImagePickerSource: Identifiable {
    case camera
    case photoLibrary

    var id: String {
        switch self {
        case .camera:
            return "camera"
        case .photoLibrary:
            return "photoLibrary"
        }
    }

    var uiKitSourceType: UIImagePickerController.SourceType {
        switch self {
        case .camera:
            return .camera
        case .photoLibrary:
            return .photoLibrary
        }
    }
}

struct ImagePicker: UIViewControllerRepresentable {
    let source: ImagePickerSource
    let onImagePicked: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.delegate = context.coordinator
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(source.uiKitSourceType) ? source.uiKitSourceType : .photoLibrary
        picker.allowsEditing = false
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        private let parent: ImagePicker

        init(_ parent: ImagePicker) {
            self.parent = parent
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.onImagePicked(image)
            }

            parent.dismiss()
        }
    }
}

private extension String {
    var utf8Data: Data {
        Data(utf8)
    }
}
