// Home-screen widget for iOS: the newest good-news headline.
//
// Add it in Xcode (it needs its own target, which only Xcode can create):
//   1. File > New > Target > Widget Extension. Name it "GoodThingsWidget", untick
//      "Include Live Activity" and "Include Configuration App Intent".
//   2. Replace the generated GoodThingsWidget.swift with this file, and delete the
//      generated *Bundle.swift file (the @main below replaces it).
//   3. In the widget target's Info.plist add the key GoodThingsAPIURL with your news
//      server address, e.g. https://good-things.onrender.com
// The widget asks the news server for the current stories itself, so it needs no data
// from the app and no App Group. It sends only the language, never anything about the reader.
import WidgetKit
import SwiftUI
import UIKit

// The app's colours, in light and dark mode.
private func adaptive(_ light: UIColor, _ dark: UIColor) -> Color {
    Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? dark : light })
}
private let surface = adaptive(UIColor(red: 1.0, green: 0.992, blue: 0.973, alpha: 1), UIColor(red: 0.098, green: 0.137, blue: 0.118, alpha: 1))
private let ink = adaptive(UIColor(red: 0.114, green: 0.169, blue: 0.137, alpha: 1), UIColor(red: 0.914, green: 0.902, blue: 0.863, alpha: 1))
private let accent = adaptive(UIColor(red: 0.208, green: 0.318, blue: 0.247, alpha: 1), UIColor(red: 0.706, green: 0.804, blue: 0.725, alpha: 1))

struct Story: Decodable {
    let id: String
    let title: String
    let source: String
    let url: String
    let tr: [String: Translation]?
    struct Translation: Decodable { let title: String? }
}
struct StoriesResponse: Decodable { let stories: [Story] }

struct Entry: TimelineEntry {
    let date: Date
    let title: String
    let source: String
    let url: URL?
}

struct Provider: TimelineProvider {
    private let placeholderText = NSLocalizedString("Open Good Things to load today's good news.", comment: "")

    func placeholder(in context: Context) -> Entry {
        Entry(date: .now, title: "Endangered sea turtles return to a restored beach", source: "Good Things", url: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        if context.isPreview { completion(placeholder(in: context)); return }
        fetch { completion($0) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        fetch { entry in
            // Check again in about an hour; iOS decides the exact time.
            completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(3600))))
        }
    }

    private func fetch(_ done: @escaping (Entry) -> Void) {
        let fallback = Entry(date: .now, title: placeholderText, source: "", url: nil)
        let lang = Locale.preferredLanguages.first.map { String($0.prefix(2)) } ?? "en"
        guard let base = Bundle.main.object(forInfoDictionaryKey: "GoodThingsAPIURL") as? String,
              var components = URLComponents(string: base.hasSuffix("/") ? base + "api/stories" : base + "/api/stories")
        else { done(fallback); return }
        components.queryItems = [URLQueryItem(name: "lang", value: lang)]
        guard let url = components.url else { done(fallback); return }

        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data, let response = try? JSONDecoder().decode(StoriesResponse.self, from: data),
                  let story = response.stories.first
            else { done(fallback); return }
            let title = story.tr?[lang]?.title ?? story.title
            done(Entry(date: .now, title: title, source: story.source, url: URL(string: story.url)))
        }.resume()
    }
}

struct GoodThingsWidgetView: View {
    var entry: Entry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Good Things")
                .font(.caption2.weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(accent)
            Text(entry.title)
                .font(.system(.headline, design: .serif))
                .foregroundStyle(ink)
                .lineLimit(4)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
            if !entry.source.isEmpty {
                Text(entry.source).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .containerBackground(for: .widget) { surface }
    }
}

@main
struct GoodThingsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GoodThingsWidget", provider: Provider()) { entry in
            GoodThingsWidgetView(entry: entry)
        }
        .configurationDisplayName("Good news")
        .description("Today's top good-news headline.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
