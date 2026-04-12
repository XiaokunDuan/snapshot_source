import Foundation

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
    let expiresAt: TimeInterval
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

struct HistoryCard: Identifiable, Codable {
    let id: Int
    let title: String
    let phonetic: String
    let meaning: String
    let example: String
    let exampleTranslation: String
    let imageURL: String?
    let sourceObject: String
    let sourceLabelEn: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case phonetic
        case meaning
        case example
        case exampleTranslation
        case imageURL
        case sourceObject
        case sourceLabelEn
        case createdAt
    }
}

struct NativeUserProfile: Codable {
    let id: Int
    let email: String
    let username: String?
    let avatarURL: String?
    let coins: Int
    let authProvider: String?

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case username
        case avatarURL = "avatarUrl"
        case coins
        case authProvider
    }
}

struct NativeBillingStatus: Codable {
    let source: String
    let subscriptionStatus: String
    let hasAccess: Bool
    let monthlyLimit: Int
    let usageCount: Int
    let remaining: Int
    let trialEndsAt: String?
    let currentPeriodStart: String?
    let currentPeriodEnd: String?
    let cancelAtPeriodEnd: Bool
}

struct NativeHistorySummaryItem: Identifiable, Codable {
    let id: Int
    let word: String
    let meaning: String
    let phonetic: String?
    let sentence: String?
    let sentenceCn: String?
    let imageURL: String?
    let sourceObject: String?
    let sourceLabelEn: String?
    let primaryLanguage: String?
    let availableLanguages: [String]
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case word
        case meaning
        case phonetic
        case sentence
        case sentenceCn = "sentenceCn"
        case imageURL = "imageUrl"
        case sourceObject
        case sourceLabelEn
        case primaryLanguage
        case availableLanguages
        case createdAt
    }
}

struct NativeHistorySummary: Codable {
    let totalCount: Int
    let recentCount: Int
    let latestAt: String?
    let recent: [NativeHistorySummaryItem]
}

struct NativeBootstrapPayload: Codable {
    let user: NativeUserProfile
    let billing: NativeBillingStatus
    let history: NativeHistorySummary
}

struct NativeTrainingCard: Identifiable, Codable {
    let id: Int
    let word: String
    let phonetic: String?
    let meaning: String
    let sentence: String?
    let sentenceCn: String?
    let imageURL: String?
    let sourceObject: String?
    let sourceLabelEn: String?
    let primaryLanguage: String?
    let availableLanguages: [String]
    let prompt: String
    let answer: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case word
        case phonetic
        case meaning
        case sentence
        case sentenceCn = "sentenceCn"
        case imageURL = "imageUrl"
        case sourceObject
        case sourceLabelEn
        case primaryLanguage
        case availableLanguages
        case prompt
        case answer
        case createdAt
    }
}

struct NativeTrainingFeedPayload: Codable {
    let cards: [NativeTrainingCard]
    let totalCount: Int
    let returnedCount: Int
    let hasMore: Bool
}
