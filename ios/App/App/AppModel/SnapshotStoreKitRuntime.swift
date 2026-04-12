import Foundation
import StoreKit

@MainActor
final class SnapshotStoreKitRuntime: ObservableObject {
    @Published private(set) var loadState: SnapshotStoreKitLoadState = .idle
    @Published private(set) var purchaseState: SnapshotStoreKitPurchaseState = .idle
    @Published private(set) var entitlementState: SnapshotStoreKitEntitlementState = .unknown
    @Published private(set) var products: [SnapshotStoreKitProductSummary] = []
    @Published private(set) var selectedProductID: String?
    @Published private(set) var lastRefreshedAt: Date?
    @Published private(set) var lastErrorMessage: String?

    private let config: SnapshotStoreKitConfig
    private var productLookup: [String: Product] = [:]
    private var transactionListenerTask: Task<Void, Never>?

    init(config: SnapshotStoreKitConfig = .live) {
        self.config = config
        self.selectedProductID = config.primaryProductID ?? config.productIDs.first

        transactionListenerTask = Task { [weak self] in
            guard let self else {
                return
            }

            for await result in Transaction.updates {
                await self.handleTransactionUpdate(result)
            }
        }
    }

    deinit {
        transactionListenerTask?.cancel()
    }

    var subscriptionSurfaceTitle: String {
        if isLoadingProducts {
            return "Loading App Store products"
        }

        switch entitlementState {
        case .active:
            return "App Store subscription active"
        case .loading:
            return "Refreshing App Store entitlement"
        case .failed:
            return "StoreKit runtime needs attention"
        case .inactive:
            return loadState.productCount == 0 ? "App Store products need configuration" : "App Store subscription inactive"
        case .unknown:
            return loadState.productCount == 0 ? "StoreKit runtime configured" : "StoreKit runtime ready"
        }
    }

    var subscriptionSurfaceSubtitle: String {
        if isLoadingProducts {
            return loadState.detail
        }

        if let lastErrorMessage, case .failed = loadState {
            return lastErrorMessage
        }

        switch purchaseState {
        case .purchasing(let productName):
            return "Waiting for App Store confirmation for \(productName)."
        case .restoring:
            return "Syncing App Store receipts and entitlement status."
        case .pending(let message):
            return message
        case .completed(let message):
            return message
        case .failed(let message):
            return message
        case .idle:
            break
        }

        switch entitlementState {
        case .active(_, let displayName, let expiresAt):
            if let expiresAt {
                return "\(displayName) is active until \(expiresAt.formatted(date: .abbreviated, time: .shortened))."
            }

            return "\(displayName) is active on this device."
        case .loading:
            return "Inspecting current App Store transactions on this device."
        case .inactive(let message):
            return message
        case .failed(let message):
            return message
        case .unknown:
            break
        }

        switch loadState {
        case .idle:
            return "The StoreKit runtime has not loaded any App Store products yet."
        case .loading:
            return "Fetching product metadata and entitlement state from StoreKit 2."
        case .ready(let productCount):
            if productCount > 0 {
                return "\(productCount) product(s) loaded. Select one to test purchase or restore."
            }

            return "Replace the placeholder product IDs in Info.plist with live App Store Connect identifiers."
        case .failed(let message):
            return message
        }
    }

    var subscriptionSurfaceSystemImage: String {
        if isLoadingProducts {
            return "arrow.triangle.2.circlepath"
        }

        switch entitlementState {
        case .active:
            return "checkmark.shield"
        case .loading:
            return "arrow.triangle.2.circlepath"
        case .failed:
            return "exclamationmark.triangle"
        case .inactive:
            return "creditcard"
        case .unknown:
            return loadState.productCount == 0 ? "shippingbox" : "cart"
        }
    }

    var selectedProductSummary: SnapshotStoreKitProductSummary? {
        guard let selectedProductID else {
            return products.first
        }

        return products.first { $0.id == selectedProductID } ?? products.first
    }

    var manageSubscriptionsURL: URL? {
        config.manageSubscriptionsURL
    }

    var configurationSummary: String {
        config.configurationSummary
    }

    var isLoadingProducts: Bool {
        if case .loading = loadState {
            return true
        }

        return false
    }

    var isPurchasing: Bool {
        if case .purchasing = purchaseState {
            return true
        }

        return false
    }

    var isRestoringPurchases: Bool {
        if case .restoring = purchaseState {
            return true
        }

        return false
    }

    var canPurchaseSelectedProduct: Bool {
        selectedProductSummary != nil && !isLoadingProducts && !isPurchasing && !isRestoringPurchases
    }

    func bootstrap() async {
        await refreshRuntime()
    }

    func refreshRuntime() async {
        await refreshProducts()
        await refreshEntitlements()
    }

    func refreshProducts() async {
        loadState = .loading
        lastErrorMessage = nil

        guard config.hasConfiguredProducts else {
            products = []
            productLookup = [:]
            loadState = .ready(productCount: 0)
            lastRefreshedAt = Date()
            return
        }

        do {
            let fetchedProducts = try await Product.products(for: config.productIDs)
            productLookup = Dictionary(uniqueKeysWithValues: fetchedProducts.map { ($0.id, $0) })

            let orderedProducts = config.productIDs.compactMap { productLookup[$0] }
            products = orderedProducts.map(SnapshotStoreKitProductSummary.init)

            if let selectedProductID, productLookup[selectedProductID] == nil {
                self.selectedProductID = config.primaryProductID ?? products.first?.id
            } else if selectedProductID == nil {
                self.selectedProductID = config.primaryProductID ?? products.first?.id
            }

            loadState = .ready(productCount: products.count)
            lastRefreshedAt = Date()

            if products.isEmpty {
                lastErrorMessage = "No App Store products resolved yet. Replace the placeholder IDs in Info.plist with live App Store Connect product IDs."
            }
        } catch {
            products = []
            productLookup = [:]
            loadState = .failed(message: error.localizedDescription)
            lastErrorMessage = error.localizedDescription
        }
    }

    func refreshEntitlements() async {
        entitlementState = .loading

        do {
            var activeTransactions: [(productID: String, displayName: String, expiresAt: Date?, purchaseDate: Date)] = []

            for await result in Transaction.currentEntitlements {
                let transaction = try verified(result)

                guard config.productIDs.isEmpty || config.productIDs.contains(transaction.productID) else {
                    continue
                }

                guard transaction.revocationDate == nil else {
                    continue
                }

                if let expirationDate = transaction.expirationDate, expirationDate < Date() {
                    continue
                }

                let displayName = productLookup[transaction.productID]?.displayName ?? transaction.productID
                activeTransactions.append((
                    productID: transaction.productID,
                    displayName: displayName,
                    expiresAt: transaction.expirationDate,
                    purchaseDate: transaction.purchaseDate
                ))
            }

            if let active = activeTransactions.sorted(by: { lhs, rhs in
                switch (lhs.expiresAt, rhs.expiresAt) {
                case let (lhsDate?, rhsDate?):
                    return lhsDate > rhsDate
                case (_?, nil):
                    return true
                case (nil, _?):
                    return false
                case (nil, nil):
                    return lhs.purchaseDate > rhs.purchaseDate
                }
            }).first {
                entitlementState = .active(
                    productID: active.productID,
                    displayName: active.displayName,
                    expiresAt: active.expiresAt
                )
            } else {
                entitlementState = .inactive(
                    message: config.hasConfiguredProducts
                        ? "No active App Store entitlement is currently available on this device."
                        : "Add live App Store product IDs in Info.plist, then refresh to inspect entitlements."
                )
            }

            lastRefreshedAt = Date()
        } catch {
            entitlementState = .failed(message: error.localizedDescription)
            lastErrorMessage = error.localizedDescription
        }
    }

    func select(productID: String) {
        selectedProductID = productID
    }

    func purchaseSelectedProduct() async {
        guard let selectedProductSummary,
              let product = productLookup[selectedProductSummary.id] else {
            purchaseState = .failed(message: "Choose a loaded StoreKit product before starting a purchase.")
            lastErrorMessage = purchaseState.detail
            return
        }

        await purchase(product)
    }

    func restorePurchases() async {
        purchaseState = .restoring
        lastErrorMessage = nil

        do {
            try await AppStore.sync()
            purchaseState = .completed(message: "App Store sync completed. Refreshing entitlements.")
            await refreshEntitlements()
        } catch {
            purchaseState = .failed(message: error.localizedDescription)
            lastErrorMessage = error.localizedDescription
        }
    }

    private func purchase(_ product: Product) async {
        purchaseState = .purchasing(productName: product.displayName)
        lastErrorMessage = nil

        do {
            let result = try await product.purchase()

            switch result {
            case .success(let verification):
                let transaction = try verified(verification)
                await transaction.finish()
                purchaseState = .completed(message: "\(product.displayName) purchase finished. Refreshing entitlement state.")
                await refreshEntitlements()
            case .pending:
                purchaseState = .pending(message: "The App Store is still processing this purchase.")
            case .userCancelled:
                purchaseState = .idle
            @unknown default:
                purchaseState = .failed(message: "The purchase returned an unknown App Store result.")
            }
        } catch {
            purchaseState = .failed(message: error.localizedDescription)
            lastErrorMessage = error.localizedDescription
        }
    }

    private func handleTransactionUpdate(_ result: VerificationResult<Transaction>) async {
        do {
            let transaction = try verified(result)

            guard config.productIDs.isEmpty || config.productIDs.contains(transaction.productID) else {
                await transaction.finish()
                return
            }

            await transaction.finish()
            await refreshEntitlements()
        } catch {
            lastErrorMessage = error.localizedDescription
        }
    }

    private func verified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value):
            return value
        case .unverified(_, let error):
            throw error
        }
    }
}
