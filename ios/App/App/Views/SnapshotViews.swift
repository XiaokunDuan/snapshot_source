import SwiftUI
import AuthenticationServices
import UIKit

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
                    signInBlock
                    progressBlock
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
            Text("Novory")
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

    @ViewBuilder
    private var signInBlock: some View {
        if !model.isSignedIn {
            VStack(alignment: .leading, spacing: 12) {
                Text("Sign in first")
                    .font(.headline)
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    model.handleAppleSignIn(result: result)
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 52)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .disabled(model.isBusy)
            }
        }
    }

    @ViewBuilder
    private var progressBlock: some View {
        if model.isBusy {
            FeatureBlock(
                title: model.activeStage.title,
                subtitle: model.activeStage.detail,
                systemImage: model.activeStage.systemImage
            )
            .overlay(alignment: .trailing) {
                ProgressView()
                    .padding(.trailing, 18)
            }
        }
    }

    private var pickerButtons: some View {
        VStack(spacing: 12) {
            Button {
                model.beginPicking(.camera) { source in
                    activePicker = source
                }
            } label: {
                ActionRow(title: "Capture Photo", subtitle: "Use the camera as the native intake flow.", systemImage: "camera")
            }
            .disabled(model.isBusy)

            Button {
                model.beginPicking(.photoLibrary) { source in
                    activePicker = source
                }
            } label: {
                ActionRow(title: "Choose from Library", subtitle: "Import an existing image before analysis.", systemImage: "photo.on.rectangle")
            }
            .disabled(model.isBusy)
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
                .disabled(!model.isSignedIn || model.isBusy)
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
    @State private var selectedCard: HistoryCard?

    var body: some View {
        NavigationView {
            List {
                if model.history.isEmpty {
                    Section {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("No synced history yet.")
                                .font(.headline)
                            Text("Sign in, run one analysis, and this page will become your saved vocabulary archive.")
                                .foregroundStyle(.secondary)

                            if model.isRefreshingHistory {
                                ProgressView("Refreshing history…")
                                    .padding(.top, 4)
                            } else {
                                Text(model.lastHistorySyncDescription)
                                    .font(.footnote)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .padding(.vertical, 8)
                    }
                } else {
                    Section {
                        FeatureBlock(
                            title: model.isRefreshingHistory ? "Refreshing History" : (model.isHistoryPreview ? "Recent Preview" : "Full Archive"),
                            subtitle: model.historySummaryLabel,
                            systemImage: model.isRefreshingHistory ? "arrow.triangle.2.circlepath" : "checkmark.arrow.trianglehead.clockwise"
                        )
                        .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                    }

                    Section {
                        Text(model.lastHistorySyncDescription)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    if model.isHistoryPreview && model.historyTotalCount > model.history.count {
                        Section {
                            Button(model.historyActionLabel) {
                                model.refreshHistory()
                            }
                            .buttonStyle(SecondaryButtonStyle())
                            .disabled(model.isRefreshingHistory)
                        }
                    }

                    Section(model.isHistoryPreview ? "Recent Preview" : "Archived Cards") {
                        ForEach(model.history) { card in
                            HStack(alignment: .top, spacing: 14) {
                                HistoryThumbnail(imageURL: card.imageURL)

                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(alignment: .top) {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(card.title)
                                                .font(.headline)
                                            if !card.phonetic.isEmpty {
                                                Text(card.phonetic)
                                                    .font(.caption.monospaced())
                                                    .foregroundStyle(.secondary)
                                            }
                                        }

                                        Spacer()

                                        Text(card.createdAt.formatted(date: .abbreviated, time: .shortened))
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                            .multilineTextAlignment(.trailing)
                                    }

                                    Text(card.meaning)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)

                                    if !card.example.isEmpty {
                                        Text(card.example)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                    }

                                    Label(card.sourceLabelEn, systemImage: "tag")
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            .padding(.vertical, 4)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                selectedCard = card
                            }
                            .swipeActions {
                                Button(role: .destructive) {
                                    model.deleteHistoryCard(card)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
            }
            .refreshable {
                model.refreshHistory()
            }
            .sheet(item: $selectedCard) { card in
                HistoryDetailScreen(card: card)
            }
            .navigationTitle("History")
        }
        .navigationViewStyle(.stack)
    }
}

struct HistoryDetailScreen: View {
    let card: HistoryCard

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    StudyCardView(
                        title: "Saved Card",
                        heading: card.title,
                        phonetic: card.phonetic,
                        meaning: card.meaning,
                        example: card.example
                    )

                    if !card.exampleTranslation.isEmpty {
                        FeatureBlock(
                            title: "Example Translation",
                            subtitle: card.exampleTranslation,
                            systemImage: "text.bubble"
                        )
                    }

                    FeatureBlock(
                        title: card.sourceObject,
                        subtitle: card.sourceLabelEn,
                        systemImage: "tag"
                    )

                    if let imageURL = card.imageURL, !imageURL.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Saved Image")
                                .font(.headline)

                            HistoryRemoteImage(imageURL: imageURL)

                            Link(destination: URL(string: imageURL)!) {
                                Label("Open saved image", systemImage: "arrow.up.right.square")
                                    .font(.subheadline.weight(.semibold))
                            }
                        }
                    }

                    Text(card.createdAt.formatted(date: .complete, time: .shortened))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("History Detail")
        }
        .navigationViewStyle(.stack)
    }
}

struct TrainScreen: View {
    @EnvironmentObject private var model: SnapshotAppModel
    @State private var deck: [NativeTrainingCard] = []
    @State private var currentIndex = 0
    @State private var revealAnswer = false
    @State private var masteredCount = 0
    @State private var reviewAgainCount = 0

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Flashcard Training")
                        .font(.largeTitle.bold())

                    if model.trainingCards.isEmpty {
                        if model.isRefreshingTrainingDeck {
                            FeatureBlock(
                                title: "Loading Training Deck",
                                subtitle: model.lastTrainingSyncDescription,
                                systemImage: "arrow.triangle.2.circlepath"
                            )
                            .overlay(alignment: .trailing) {
                                ProgressView()
                                    .padding(.trailing, 18)
                            }
                        } else {
                            FeatureBlock(
                                title: "No training cards yet",
                                subtitle: "The training deck comes from the compact native feed instead of the full history payload.",
                                systemImage: "rectangle.stack.badge.plus"
                            )

                            if model.isSignedIn {
                                Button("Load Training Deck") {
                                    model.refreshTrainingDeck()
                                }
                                .buttonStyle(SecondaryButtonStyle())
                            }
                        }
                    } else {
                        FeatureBlock(
                            title: model.isRefreshingTrainingDeck ? "Refreshing Training Feed" : "Training Deck Ready",
                            subtitle: model.lastTrainingSyncDescription,
                            systemImage: model.isRefreshingTrainingDeck ? "arrow.triangle.2.circlepath" : "rectangle.stack.badge.play"
                        )
                        progressSummary
                        trainingCard
                        trainingActions
                    }
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Train")
        }
        .navigationViewStyle(.stack)
        .onAppear {
            if model.trainingCards.isEmpty && !model.isRefreshingTrainingDeck {
                model.refreshTrainingDeck()
            }
            rebuildDeckIfNeeded()
        }
        .onChange(of: model.trainingCards.count) { _ in
            rebuildDeck(resetStats: true)
        }
    }

    private var currentCard: NativeTrainingCard? {
        guard !deck.isEmpty, currentIndex < deck.count else {
            return nil
        }

        return deck[currentIndex]
    }

    private var progressSummary: some View {
        let remaining = max(deck.count - currentIndex, 0)

        return VStack(alignment: .leading, spacing: 12) {
            FeatureBlock(
                title: "Round Progress",
                subtitle: "\(currentIndex + (currentCard == nil ? 0 : 1)) / \(max(deck.count, 1)) cards in this session",
                systemImage: "chart.bar.doc.horizontal"
            )

            HStack(spacing: 12) {
                MetricPill(title: "Mastered", value: "\(masteredCount)", tint: Color(red: 0.18, green: 0.53, blue: 0.31))
                MetricPill(title: "Review Again", value: "\(reviewAgainCount)", tint: Color(red: 0.78, green: 0.39, blue: 0.12))
                MetricPill(title: "Remaining", value: "\(remaining)", tint: Color(red: 0.12, green: 0.36, blue: 0.62))
            }
        }
    }

    @ViewBuilder
    private var trainingCard: some View {
        if let card = currentCard {
            VStack(alignment: .leading, spacing: 14) {
                Text(revealAnswer ? "Answer" : "Prompt")
                    .font(.headline)
                    .foregroundStyle(.secondary)

                if revealAnswer {
                    StudyCardView(
                        title: "Review",
                        heading: card.word,
                        phonetic: card.phonetic ?? "",
                        meaning: card.answer,
                        example: card.sentence ?? ""
                    )

                    if let sentenceCn = card.sentenceCn, !sentenceCn.isEmpty {
                        FeatureBlock(
                            title: "Translation",
                            subtitle: sentenceCn,
                            systemImage: "character.book.closed"
                        )
                    }
                } else {
                    StudyCardView(
                        title: "Guess the word",
                        heading: card.prompt,
                        phonetic: card.phonetic ?? "",
                        meaning: card.sourceLabelEn ?? card.sourceObject ?? card.word,
                        example: card.sentence ?? "Try to recall the saved vocabulary card before revealing the answer."
                    )
                }
            }
        } else {
            FeatureBlock(
                title: "Round Complete",
                subtitle: "You reached the end of the current deck. Restart to train on the latest saved history again.",
                systemImage: "checkmark.seal"
            )
        }
    }

    private var trainingActions: some View {
        VStack(spacing: 12) {
            if currentCard != nil {
                Button(revealAnswer ? "Hide Answer" : "Reveal Answer") {
                    revealAnswer.toggle()
                }
                .buttonStyle(SecondaryButtonStyle())

                if revealAnswer {
                    HStack(spacing: 12) {
                        Button("Review Again") {
                            advance(markedAsMastered: false)
                        }
                        .buttonStyle(SecondaryButtonStyle())

                        Button("Mastered") {
                            advance(markedAsMastered: true)
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    }
                } else {
                    Button("Skip for Now") {
                        advance(markedAsMastered: false)
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }

            Button(deck.isEmpty ? "Start Training" : "Restart Round") {
                if deck.isEmpty {
                    model.refreshTrainingDeck()
                } else {
                    rebuildDeck(resetStats: true)
                }
            }
            .buttonStyle(SecondaryButtonStyle())
        }
    }

    private func advance(markedAsMastered: Bool) {
        if markedAsMastered {
            masteredCount += 1
        } else {
            reviewAgainCount += 1
        }

        revealAnswer = false

        if currentIndex + 1 < deck.count {
            currentIndex += 1
        } else {
            currentIndex = deck.count
        }
    }

    private func rebuildDeckIfNeeded() {
        if deck.isEmpty && !model.trainingCards.isEmpty {
            rebuildDeck(resetStats: true)
        }
    }

    private func rebuildDeck(resetStats: Bool) {
        deck = model.trainingCards.shuffled()
        currentIndex = 0
        revealAnswer = false
        if resetStats {
            masteredCount = 0
            reviewAgainCount = 0
        }
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
                        subtitle: model.accountSummaryLabel,
                        systemImage: "person.crop.circle.badge.checkmark"
                    )

                    FeatureBlock(
                        title: "Billing",
                        subtitle: model.subscriptionLabel,
                        systemImage: "creditcard"
                    )
                    StoreKitRuntimePanel(runtime: model.storeKitRuntime)

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
