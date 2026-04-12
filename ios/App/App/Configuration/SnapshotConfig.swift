import Foundation

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
