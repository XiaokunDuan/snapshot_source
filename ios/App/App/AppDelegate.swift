import UIKit
import SwiftUI
import PhotosUI
import AuthenticationServices

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let rootView = SnapshotAppRootView()
        let hostingController = UIHostingController(rootView: rootView)

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = hostingController
        window.makeKeyAndVisible()
        self.window = window

        return true
    }
}

final class SnapshotAppModel: ObservableObject {
    @Published var selectedImage: UIImage?
    @Published var latestCard: StudyCard?
    @Published var history: [StudyCard] = [
        StudyCard(
            title: "espresso cup",
            phonetic: "/esˈpres.oʊ/",
            meaning: "A small strong coffee served in a compact shot.",
            example: "The espresso cup on the counter became today's vocabulary card.",
            createdAt: Date().addingTimeInterval(-86_400)
        ),
        StudyCard(
            title: "receipt",
            phonetic: "/rɪˈsiːt/",
            meaning: "A printed record that proves a payment was made.",
            example: "Keep the receipt so you can review the store vocabulary later.",
            createdAt: Date().addingTimeInterval(-172_800)
        ),
    ]
    @Published var isSignedIn = false
    @Published var subscriptionPlan = "Snapshot Pro Preview"

    func analyzeSelection() {
        let card = StudyCard(
            title: "street sign",
            phonetic: "/striːt saɪn/",
            meaning: "A public sign that names a road or gives guidance in a city.",
            example: "The street sign turned into a bilingual study card for review tonight.",
            createdAt: Date()
        )

        latestCard = card
        history.insert(card, at: 0)
    }
}

struct StudyCard: Identifiable {
    let id = UUID()
    let title: String
    let phonetic: String
    let meaning: String
    let example: String
    let createdAt: Date
}

struct SnapshotAppRootView: View {
    @StateObject private var model = SnapshotAppModel()

    var body: some View {
        TabView {
            HomeScreen()
                .tabItem {
                    Label("Home", systemImage: "sparkles.rectangle.stack")
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
        .tint(Color(red: 0.07, green: 0.31, blue: 0.24))
    }
}

struct HomeScreen: View {
    @EnvironmentObject private var model: SnapshotAppModel
    @State private var activePicker: ImagePickerSource?

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Snapshot")
                            .font(.largeTitle.bold())
                        Text("Native iPhone and iPad workspace for photo-driven vocabulary study.")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    FeatureBlock(
                        title: "Native foundation",
                        subtitle: "This shell replaces the old Capacitor/PWA entrypoint and is ready for Apple login, StoreKit 2, and API migration.",
                        systemImage: "iphone.gen3.radiowaves.left.and.right"
                    )

                    VStack(spacing: 12) {
                        Button {
                            activePicker = .camera
                        } label: {
                            ActionRow(title: "Capture Photo", subtitle: "Use the camera as the main intake flow.", systemImage: "camera")
                        }

                        Button {
                            activePicker = .photoLibrary
                        } label: {
                            ActionRow(title: "Choose from Library", subtitle: "Import an existing image into the study desk.", systemImage: "photo.on.rectangle")
                        }
                    }
                    .buttonStyle(.plain)

                    if let image = model.selectedImage {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Selected image")
                                .font(.headline)
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFit()
                                .frame(maxWidth: .infinity)
                                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                            Button("Create Study Card") {
                                model.analyzeSelection()
                            }
                            .buttonStyle(PrimaryButtonStyle())
                        }
                    }

                    if let latestCard = model.latestCard {
                        StudyCardView(card: latestCard, title: "Latest Analysis")
                    }
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
    }
}

struct HistoryScreen: View {
    @EnvironmentObject private var model: SnapshotAppModel

    var body: some View {
        NavigationView {
            List {
                Section("Archived Cards") {
                    ForEach(model.history) { card in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(card.title)
                                .font(.headline)
                            Text(card.meaning)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Text(card.createdAt.formatted(date: .abbreviated, time: .omitted))
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 4)
                    }
                }
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
                        subtitle: "Analyze an image first, then your training queue will populate here.",
                        systemImage: "tray"
                    )
                } else {
                    let card = model.history[min(currentIndex, max(model.history.count - 1, 0))]
                    StudyCardView(card: card, title: "Review")

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
                        Text("Account and monetization move to Apple-native flows from here.")
                            .foregroundStyle(.secondary)
                    }

                    FeatureBlock(
                        title: model.subscriptionPlan,
                        subtitle: "StoreKit 2 will own subscriptions. Stripe and browser checkout are no longer the app path.",
                        systemImage: "creditcard.and.123"
                    )

                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { _ in
                        model.isSignedIn = true
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    Text(model.isSignedIn ? "Apple account connected in the native shell." : "Use Sign in with Apple as the future account system.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
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
    let card: StudyCard
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
            VStack(alignment: .leading, spacing: 8) {
                Text(card.title)
                    .font(.title2.bold())
                Text(card.phonetic)
                    .font(.subheadline.monospaced())
                    .foregroundStyle(.secondary)
                Text(card.meaning)
                    .font(.body)
                Text(card.example)
                    .font(.callout)
                    .foregroundStyle(.secondary)
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
                .foregroundStyle(Color(red: 0.07, green: 0.31, blue: 0.24))
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
                    .fill(Color(red: 0.07, green: 0.31, blue: 0.24))
                    .opacity(configuration.isPressed ? 0.8 : 1)
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
