import Foundation

struct SnapshotStoreKitConfig {
    let productIDs: [String]
    let primaryProductID: String?
    let subscriptionGroupID: String?
    let manageSubscriptionsURL: URL?
    let environmentName: String

    static let fallbackProductIDs = [
        "com.yulu34.vocabulary.pro.monthly",
        "com.yulu34.vocabulary.pro.yearly",
    ]

    static let fallbackPrimaryProductID = "com.yulu34.vocabulary.pro.monthly"
    static let fallbackSubscriptionGroupID = "com.yulu34.vocabulary.subscriptions"
    static let fallbackManageSubscriptionsURL = URL(string: "https://apps.apple.com/account/subscriptions")!

    static var live: SnapshotStoreKitConfig {
        let rawProductIDs = readStringArray(forKey: "SnapshotStoreKitProductIDs")
        let selectedProductIDs: [String]
        if let rawProductIDs, !rawProductIDs.isEmpty {
            selectedProductIDs = rawProductIDs
        } else {
            selectedProductIDs = fallbackProductIDs
        }
        let normalizedProductIDs = selectedProductIDs
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let primaryProductID = readString(forKey: "SnapshotStoreKitPrimaryProductID")
            ?? normalizedProductIDs.first
            ?? fallbackPrimaryProductID

        return SnapshotStoreKitConfig(
            productIDs: normalizedProductIDs.isEmpty ? fallbackProductIDs : normalizedProductIDs,
            primaryProductID: primaryProductID,
            subscriptionGroupID: readString(forKey: "SnapshotStoreKitSubscriptionGroupID")
                ?? fallbackSubscriptionGroupID,
            manageSubscriptionsURL: readURL(forKey: "SnapshotStoreKitManageSubscriptionsURL")
                ?? fallbackManageSubscriptionsURL,
            environmentName: readString(forKey: "SnapshotStoreKitEnvironment") ?? "Sandbox"
        )
    }

    var hasConfiguredProducts: Bool {
        !productIDs.isEmpty
    }

    var configurationSummary: String {
        let productSummary = productIDs.joined(separator: ", ")
        return "Products: \(productSummary) · Group: \(subscriptionGroupID ?? "unset") · Environment: \(environmentName)"
    }

    private static func readString(forKey key: String) -> String? {
        let value = Bundle.main.object(forInfoDictionaryKey: key) as? String
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let trimmed, !trimmed.isEmpty else {
            return nil
        }

        return trimmed
    }

    private static func readStringArray(forKey key: String) -> [String]? {
        if let values = Bundle.main.object(forInfoDictionaryKey: key) as? [String] {
            let normalized = values
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            return normalized.isEmpty ? nil : normalized
        }

        if let values = Bundle.main.object(forInfoDictionaryKey: key) as? [Any] {
            let normalized = values.compactMap { $0 as? String }
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            return normalized.isEmpty ? nil : normalized
        }

        if let value = readString(forKey: key) {
            return [value]
        }

        return nil
    }

    private static func readURL(forKey key: String) -> URL? {
        guard let string = readString(forKey: key) else {
            return nil
        }

        return URL(string: string)
    }
}
