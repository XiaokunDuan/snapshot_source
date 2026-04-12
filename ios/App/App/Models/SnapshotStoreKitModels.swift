import Foundation
import StoreKit

struct SnapshotStoreKitProductSummary: Identifiable, Equatable {
    let id: String
    let displayName: String
    let description: String
    let displayPrice: String
    let typeLabel: String
    let subscriptionPeriodDescription: String?

    init(product: Product) {
        self.id = product.id
        self.displayName = product.displayName
        self.description = product.description
        self.displayPrice = product.displayPrice
        self.typeLabel = Self.typeLabel(for: product.type)
        if let subscription = product.subscription {
            self.subscriptionPeriodDescription = Self.describe(subscription.subscriptionPeriod)
        } else {
            self.subscriptionPeriodDescription = nil
        }
    }

    var subtitle: String {
        var parts = [displayPrice, typeLabel]
        if let subscriptionPeriodDescription {
            parts.append(subscriptionPeriodDescription)
        }
        return parts.joined(separator: " · ")
    }

    private static func typeLabel(for type: Product.ProductType) -> String {
        switch type {
        case .autoRenewable:
            return "Auto-renewable"
        case .consumable:
            return "Consumable"
        case .nonConsumable:
            return "Non-consumable"
        case .nonRenewable:
            return "Non-renewable"
        default:
            return "Product"
        }
    }

    private static func describe(_ period: Product.SubscriptionPeriod) -> String {
        let count = period.value
        let unit: String

        switch period.unit {
        case .day:
            unit = count == 1 ? "day" : "days"
        case .week:
            unit = count == 1 ? "week" : "weeks"
        case .month:
            unit = count == 1 ? "month" : "months"
        case .year:
            unit = count == 1 ? "year" : "years"
        @unknown default:
            unit = "period"
        }

        return "\(count) \(unit)"
    }
}

enum SnapshotStoreKitLoadState: Equatable {
    case idle
    case loading
    case ready(productCount: Int)
    case failed(message: String)

    var productCount: Int? {
        if case .ready(let count) = self {
            return count
        }

        return nil
    }

    var title: String {
        switch self {
        case .idle:
            return "StoreKit idle"
        case .loading:
            return "Loading App Store products"
        case .ready(let productCount):
            return productCount > 0 ? "App Store products ready" : "App Store products not resolved yet"
        case .failed:
            return "StoreKit load failed"
        }
    }

    var detail: String {
        switch self {
        case .idle:
            return "The runtime has not loaded any App Store products yet."
        case .loading:
            return "Fetching product metadata and entitlement state from StoreKit 2."
        case .ready(let productCount):
            if productCount > 0 {
                return "\(productCount) product(s) loaded from the App Store configuration."
            }

            return "Replace the placeholder product IDs in Info.plist with live App Store Connect identifiers."
        case .failed(let message):
            return message
        }
    }

    var systemImage: String {
        switch self {
        case .idle:
            return "shippingbox"
        case .loading:
            return "arrow.triangle.2.circlepath"
        case .ready(let productCount):
            return productCount > 0 ? "checkmark.seal" : "exclamationmark.triangle"
        case .failed:
            return "exclamationmark.octagon"
        }
    }
}

enum SnapshotStoreKitPurchaseState: Equatable {
    case idle
    case purchasing(productName: String)
    case restoring
    case pending(message: String)
    case completed(message: String)
    case failed(message: String)

    var title: String {
        switch self {
        case .idle:
            return "Ready to purchase"
        case .purchasing(let productName):
            return "Purchasing \(productName)"
        case .restoring:
            return "Restoring purchases"
        case .pending:
            return "Purchase pending"
        case .completed:
            return "Purchase complete"
        case .failed:
            return "Purchase failed"
        }
    }

    var detail: String {
        switch self {
        case .idle:
            return "Select a product and test the StoreKit 2 purchase path."
        case .purchasing(let productName):
            return "Waiting for App Store confirmation for \(productName)."
        case .restoring:
            return "Syncing App Store receipts and refreshing entitlements."
        case .pending(let message):
            return message
        case .completed(let message):
            return message
        case .failed(let message):
            return message
        }
    }

    var systemImage: String {
        switch self {
        case .idle:
            return "cart"
        case .purchasing:
            return "creditcard"
        case .restoring:
            return "arrow.clockwise"
        case .pending:
            return "clock.arrow.circlepath"
        case .completed:
            return "checkmark.circle"
        case .failed:
            return "xmark.octagon"
        }
    }
}

enum SnapshotStoreKitEntitlementState: Equatable {
    case unknown
    case loading
    case active(productID: String, displayName: String, expiresAt: Date?)
    case inactive(message: String)
    case failed(message: String)

    var title: String {
        switch self {
        case .unknown:
            return "Entitlement unknown"
        case .loading:
            return "Refreshing entitlement"
        case .active:
            return "App Store subscription active"
        case .inactive:
            return "No active App Store entitlement"
        case .failed:
            return "Entitlement refresh failed"
        }
    }

    var detail: String {
        switch self {
        case .unknown:
            return "The runtime has not checked current entitlements yet."
        case .loading:
            return "Inspecting current App Store transactions on this device."
        case .active(let productID, let displayName, let expiresAt):
            if let expiresAt {
                return "\(displayName) (\(productID)) is active until \(expiresAt.formatted(date: .abbreviated, time: .shortened))."
            }

            return "\(displayName) (\(productID)) is active on this device."
        case .inactive(let message):
            return message
        case .failed(let message):
            return message
        }
    }

    var systemImage: String {
        switch self {
        case .unknown:
            return "questionmark.circle"
        case .loading:
            return "arrow.triangle.2.circlepath"
        case .active:
            return "checkmark.shield"
        case .inactive:
            return "shield.slash"
        case .failed:
            return "exclamationmark.triangle"
        }
    }
}
