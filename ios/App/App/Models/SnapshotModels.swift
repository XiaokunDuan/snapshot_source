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
