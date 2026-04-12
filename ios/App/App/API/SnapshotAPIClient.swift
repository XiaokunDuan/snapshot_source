import Foundation

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

private struct AuthResponse: Decodable {
    let sessionToken: String
    let user: SessionUser
    let sessionExpiresAt: TimeInterval

    enum CodingKeys: String, CodingKey {
        case sessionToken
        case user
        case sessionExpiresAt
    }
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
    let sentenceCN: String?
    let imageURL: String?
    let sourceObject: String?
    let sourceLabelEn: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case word
        case phonetic
        case meaning
        case sentence
        case sentenceCN = "sentence_cn"
        case imageURL = "image_url"
        case sourceObject = "source_object"
        case sourceLabelEn = "source_label_en"
        case createdAt = "created_at"
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    case unauthorized
    case server(String)
    case imagePreparationFailed
    case cameraUnavailable

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The server returned an invalid response."
        case .unauthorized:
            return "Your session expired. Please sign in again."
        case .server(let message):
            return message
        case .imagePreparationFailed:
            return "Failed to prepare the selected image for upload."
        case .cameraUnavailable:
            return "Camera is not available on this device. Use the photo library instead."
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
        return SessionState(token: decoded.sessionToken, user: decoded.user, expiresAt: decoded.sessionExpiresAt)
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
                exampleTranslation: item.sentenceCN ?? "",
                imageURL: item.imageURL,
                sourceObject: item.sourceObject ?? item.word,
                sourceLabelEn: item.sourceLabelEn ?? item.word,
                createdAt: formatter.date(from: item.createdAt) ?? Date()
            )
        }
    }

    func deleteHistory(session: SessionState, id: Int) async throws {
        var request = authorizedRequest(path: "api/history?id=\(id)", session: session)
        request.httpMethod = "DELETE"
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
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
            if httpResponse.statusCode == 401 {
                throw APIError.unauthorized
            }
            if let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = payload["error"] as? String {
                throw APIError.server(message)
            }

            throw APIError.server("Request failed with status \(httpResponse.statusCode)")
        }
    }
}
