// Sleeky Notes' widgets, for the Home Screen and the Lock Screen. They read your notes from the folder the Sleek apps
// share (NoteData.swift), afresh whenever an app writes there and every half hour.
//
//   Pinned    your pinned notes: three titles (small), four tiles (medium) or six rows (large)
//   Note      one note you choose (press and hold the widget, Edit Widget): its text and its checklist
//   Recent    the notes you changed last, with a way to jot a new one; also on the Lock Screen
//   Jot       one press to jot something down; also a round button on the Lock Screen
//
// A press on a note opens it in Sleeky Notes. A locked note shows its title, its icon and a lock, never its text.
import AppIntents
import SwiftUI
import WidgetKit

// ---------- colours and small pieces ----------
func nHex(_ s: String) -> Color {
  let v = UInt64(s.trimmingCharacters(in: CharacterSet(charactersIn: "#")).prefix(6), radix: 16) ?? 0xF5A80C
  return Color(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
}
enum NC {
  static let amber = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 1, green: 0.773, blue: 0.239, alpha: 1) : UIColor(red: 0.961, green: 0.659, blue: 0.047, alpha: 1) })
  static let ink = nHex("#2A1B00")
  static let bg = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.11, green: 0.11, blue: 0.125, alpha: 1) : .white })
  static let fill = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.165, green: 0.165, blue: 0.19, alpha: 1) : UIColor(red: 0.945, green: 0.945, blue: 0.96, alpha: 1) })
}
enum NText {
  static func ago(_ ms: Double) -> String {
    guard ms > 0 else { return "" }; let s = Date().timeIntervalSince1970 - ms / 1000
    if s < 60 { return "Now" }; if s < 3600 { return "\(Int(s / 60))m" }; if s < 86400 { return "\(Int(s / 3600))h" }
    if s < 172800 { return "Yesterday" }; let d = Date(timeIntervalSince1970: ms / 1000)
    return s < 6 * 86400 ? d.formatted(.dateTime.weekday(.abbreviated)) : d.formatted(.dateTime.day().month(.abbreviated))
  }
}
/// A note's icon on its tinted square.
struct NIcon: View {
  let n: NoteGlance; var size: CGFloat = 30
  var body: some View {
    Image(systemName: NoteData.symbol(n.icon)).font(.system(size: size * 0.48, weight: .semibold)).foregroundStyle(nHex(n.color))
      .frame(width: size, height: size).background(nHex(n.color).opacity(0.16), in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)).widgetAccentable()
  }
}
struct NHead: View {
  let title: String; var right: String = ""
  var body: some View {
    HStack(spacing: 6) {
      RoundedRectangle(cornerRadius: 3).fill(NC.amber).frame(width: 8, height: 8).widgetAccentable()
      Text(title).lineLimit(1)
      Spacer(minLength: 4)
      if !right.isEmpty { Text(right).foregroundStyle(.tertiary).lineLimit(1) }
    }.font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
  }
}
private struct NLocked: View {
  var size: CGFloat = 11.5
  var body: some View { Label("Locked", systemImage: "lock.fill").font(.system(size: size, weight: .medium)).foregroundStyle(.tertiary).labelStyle(.titleAndIcon) }
}
private struct NEmpty: View {
  let text: String
  var body: some View { Text(text).font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center) }
}
/// "Jot", a small amber button that opens the box to jot something down.
private struct NJotLink: View {
  var body: some View { Link(destination: NoteData.link("jot")) { Label("Jot", systemImage: "plus").font(.system(size: 12, weight: .bold)).foregroundStyle(NC.amber) } }
}

// ---------- what a widget shows, and when it reads again ----------
struct NEntry: TimelineEntry {
  let date: Date
  let notes: [NoteGlance]
  var pick: NoteGlance? = nil
  var pinned: [NoteGlance] { let p = notes.filter(\.pin); return p.isEmpty ? notes : p }
  var anyPinned: Bool { notes.contains(where: \.pin) }
  static func now(pick id: String? = nil) -> NEntry {
    let all = NoteData.read(Shared.root)
    return NEntry(date: Date(), notes: all, pick: id.flatMap { i in all.first { $0.id == i } } ?? all.first)
  }
  /// What the list of widgets shows before you have any notes.
  static let sample: NEntry = {
    let t = Date().timeIntervalSince1970 * 1000
    let all = [
      NoteGlance(id: "sample1", title: "Sunday pasta sauce", icon: "food", color: "#FF7A45", folder: "Home", tags: ["recipes"], pin: true, lock: false, at: t - 7_200_000,
                 lines: [NoteLine(text: "2 tins of plum tomatoes", check: true, done: true), NoteLine(text: "4 cloves of garlic", check: true, done: false), NoteLine(text: "Basil at the very end", check: true, done: false), NoteLine(text: "Simmer low for 40 minutes.", check: false, done: false)]),
      NoteGlance(id: "sample2", title: "Wi-Fi at the cabin", icon: "wifi", color: "#0A84FF", folder: "Home", tags: [], pin: true, lock: true, at: t - 90_000_000, lines: []),
      NoteGlance(id: "sample3", title: "Gift ideas", icon: "gift", color: "#E5487F", folder: "Personal", tags: ["gifts"], pin: true, lock: false, at: t - 180_000_000, lines: [NoteLine(text: "The blue ceramic teapot", check: false, done: false)]),
      NoteGlance(id: "sample4", title: "Books to read next", icon: "book", color: "#12A36A", folder: "Personal", tags: [], pin: false, lock: false, at: t - 400_000_000, lines: [NoteLine(text: "Something short for the flight", check: false, done: false)])]
    return NEntry(date: Date(), notes: all, pick: all[0])
  }()
}
private func nPolicy() -> TimelineReloadPolicy { .after(Date().addingTimeInterval(1800)) }
struct NPlain: TimelineProvider {
  func placeholder(in context: Context) -> NEntry { .sample }
  func getSnapshot(in context: Context, completion: @escaping (NEntry) -> Void) { let e = NEntry.now(); completion(context.isPreview && e.notes.isEmpty ? .sample : e) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<NEntry>) -> Void) { completion(Timeline(entries: [NEntry.now()], policy: nPolicy())) }
}
// choosing the note (press and hold the widget, Edit Widget)
struct NotePick: AppEntity {
  let id: String
  let name: String
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Note"
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
  static let defaultQuery = NoteQuery()
}
struct NoteQuery: EntityQuery {
  func all() -> [NotePick] { NoteData.read(Shared.root).map { NotePick(id: $0.id, name: $0.shown) } }
  func entities(for ids: [String]) async throws -> [NotePick] { all().filter { ids.contains($0.id) } }
  func suggestedEntities() async throws -> [NotePick] { all() }
}
struct NChooseNote: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Choose a Note"
  static let description = IntentDescription("The note this widget shows. Leave it empty for your first pinned note, or the one you changed last.")
  @Parameter(title: "Note") var note: NotePick?
  init() {}
}
struct NPickTimeline: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> NEntry { .sample }
  func snapshot(for c: NChooseNote, in context: Context) async -> NEntry { let e = NEntry.now(pick: c.note?.id); return context.isPreview && e.notes.isEmpty ? .sample : e }
  func timeline(for c: NChooseNote, in context: Context) async -> Timeline<NEntry> { Timeline(entries: [NEntry.now(pick: c.note?.id)], policy: nPolicy()) }
}

// ---------- Pinned ----------
struct NPinnedView: View {
  let e: NEntry, family: WidgetFamily
  var body: some View {
    let list = e.pinned, title = e.anyPinned ? "Pinned" : "Notes"
    if list.isEmpty { NEmpty(text: "Your pinned notes show here").widgetURL(NoteData.link("jot")) }
    else if family == .systemSmall {
      VStack(alignment: .leading, spacing: 7) {
        NHead(title: title)
        ForEach(list.prefix(3)) { n in
          HStack(spacing: 8) { NIcon(n: n, size: 26); Text(n.shown).font(.system(size: 13, weight: .semibold)).lineLimit(1); if n.lock { Spacer(minLength: 0); Image(systemName: "lock.fill").font(.system(size: 9)).foregroundStyle(.tertiary) } }
        }
        Spacer(minLength: 0)
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(NoteData.link("open"))
    } else if family == .systemMedium {
      VStack(alignment: .leading, spacing: 8) {
        HStack { NHead(title: title); NJotLink() }
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
          ForEach(list.prefix(4)) { n in
            Link(destination: NoteData.link("open", id: n.id)) {
              HStack(spacing: 9) {
                NIcon(n: n, size: 32)
                VStack(alignment: .leading, spacing: 1) {
                  Text(n.shown).font(.system(size: 13, weight: .bold)).lineLimit(1)
                  if n.lock { NLocked(size: 11) } else { Text(n.peek.isEmpty ? NText.ago(n.at) : n.peek).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1) }
                }
                Spacer(minLength: 0)
              }.padding(8).frame(maxWidth: .infinity, alignment: .leading).background(NC.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
          }
        }
        Spacer(minLength: 0)
      }
    } else {
      VStack(alignment: .leading, spacing: 4) {
        HStack { NHead(title: title); NJotLink() }
        NRows(list: Array(list.prefix(6)))
      }
    }
  }
}
/// Notes as rows: icon, title, first words, when.
private struct NRows: View {
  let list: [NoteGlance]
  var body: some View {
    VStack(spacing: 0) {
      ForEach(list) { n in
        Link(destination: NoteData.link("open", id: n.id)) {
          HStack(spacing: 10) {
            NIcon(n: n, size: 30)
            VStack(alignment: .leading, spacing: 0) {
              Text(n.shown).font(.system(size: 13.5, weight: .bold)).lineLimit(1)
              if n.lock { NLocked() } else if !n.peek.isEmpty { Text(n.peek).font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(1) }
            }
            Spacer(minLength: 2)
            Text(NText.ago(n.at)).font(.system(size: 11.5)).foregroundStyle(.tertiary)
          }.frame(maxHeight: 56)
        }
      }
      Spacer(minLength: 0)
    }
  }
}

// ---------- one note ----------
struct NNoteView: View {
  let e: NEntry, family: WidgetFamily
  var body: some View {
    if let n = e.pick {
      let small = family == .systemSmall, room = family == .systemLarge ? 11 : small ? 2 : 3
      VStack(alignment: .leading, spacing: small ? 6 : 8) {
        HStack(spacing: 10) {
          NIcon(n: n, size: small ? 34 : 38)
          if !small { VStack(alignment: .leading, spacing: 0) { Text(n.shown).font(.system(size: 16, weight: .bold)).lineLimit(1); Text([n.folder, NText.ago(n.at)].filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(1) } }
          Spacer(minLength: 0)
          if n.pin { Image(systemName: "pin.fill").font(.system(size: 11)).foregroundStyle(NC.amber).widgetAccentable() }
        }
        if small { Text(n.shown).font(.system(size: 15, weight: .bold)).lineLimit(2) }
        if n.lock {
          if small { NLocked() } else { VStack(spacing: 4) { Image(systemName: "lock.fill").font(.system(size: 20)).foregroundStyle(NC.amber).widgetAccentable(); Text("Locked. Press to open it in Sleeky Notes.").font(.system(size: 12)).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, maxHeight: .infinity) }
        } else {
          let lines = n.lines.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
          VStack(alignment: .leading, spacing: small ? 2 : 5) {
            ForEach(Array(lines.prefix(room).enumerated()), id: \.offset) { _, l in
              if l.check {
                HStack(spacing: 7) {
                  ZStack { RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(l.done ? NC.amber : Color.secondary.opacity(0.55), lineWidth: 1.6).background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(l.done ? NC.amber : .clear)); if l.done { Image(systemName: "checkmark").font(.system(size: 8.5, weight: .heavy)).foregroundStyle(NC.ink) } }.frame(width: 16, height: 16)
                  Text(l.text).font(.system(size: small ? 11.5 : 13, weight: .medium)).strikethrough(l.done).foregroundStyle(l.done ? Color.secondary : Color.primary).lineLimit(1)
                }
              } else { Text(l.text).font(.system(size: small ? 11.5 : 13)).foregroundStyle(.secondary).lineLimit(small ? 1 : 2) }
            }
            if lines.count > room { Text("and \(lines.count - room) more").font(.system(size: 11)).foregroundStyle(.tertiary) }
          }
        }
        Spacer(minLength: 0)
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(NoteData.link("open", id: n.id))
    } else { NEmpty(text: "Your note shows here").widgetURL(NoteData.link("jot")) }
  }
}

// ---------- Recent ----------
struct NRecentView: View {
  let e: NEntry, family: WidgetFamily
  var body: some View {
    let list = e.notes.sorted { $0.at > $1.at }
    if family == .accessoryInline {
      Label(list.first?.shown ?? "Jot a note", systemImage: "note.text").widgetURL(list.first.map { NoteData.link("open", id: $0.id) } ?? NoteData.link("jot"))
    } else if family == .accessoryRectangular {
      VStack(alignment: .leading, spacing: 1) {
        Label("Notes", systemImage: "note.text").font(.system(size: 12, weight: .bold)).widgetAccentable()
        if list.isEmpty { Text("Press to jot one down").font(.system(size: 12)).foregroundStyle(.secondary) }
        ForEach(list.prefix(2)) { n in HStack(spacing: 4) { if n.lock { Image(systemName: "lock.fill").font(.system(size: 9)) }; Text(n.shown).font(.system(size: 13, weight: .medium)).lineLimit(1) } }
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(NoteData.link(list.isEmpty ? "jot" : "open"))
    } else if list.isEmpty { NEmpty(text: "Jot something down and it shows here").widgetURL(NoteData.link("jot")) }
    else {
      VStack(alignment: .leading, spacing: 4) {
        HStack { NHead(title: "Recent notes"); NJotLink() }
        NRows(list: Array(list.prefix(family == .systemLarge ? 6 : 3)))
      }
    }
  }
}

// ---------- Jot ----------
struct NJotView: View {
  let family: WidgetFamily
  var body: some View {
    if family == .accessoryCircular {
      ZStack { AccessoryWidgetBackground(); Image(systemName: "square.and.pencil").font(.system(size: 21, weight: .medium)) }.widgetURL(NoteData.link("jot"))
    } else {
      VStack(alignment: .leading, spacing: 2) {
        Image(systemName: "plus").font(.system(size: 22, weight: .bold)).foregroundStyle(NC.ink).frame(width: 44, height: 44).background(NC.amber, in: RoundedRectangle(cornerRadius: 14, style: .continuous)).widgetAccentable()
        Spacer(minLength: 0)
        Text("Jot a note").font(.system(size: 17, weight: .bold))
        Text("Kept the moment you write it").font(.system(size: 12)).foregroundStyle(.secondary)
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(NoteData.link("jot"))
    }
  }
}

// ---------- the widgets themselves ----------
/// Hands the widget's size to its view, and gives Home Screen sizes their background (the Lock Screen draws its own).
struct NFam<V: View>: View {
  @Environment(\.widgetFamily) var f
  let make: (WidgetFamily) -> V
  init(@ViewBuilder _ make: @escaping (WidgetFamily) -> V) { self.make = make }
  var body: some View { make(f).tint(.primary).containerBackground(for: .widget) { if [.systemSmall, .systemMedium, .systemLarge].contains(f) { NC.bg } else { Color.clear } } }
}
struct NotesPinnedWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "notes.pinned", provider: NPlain()) { e in NFam { NPinnedView(e: e, family: $0) } }
      .configurationDisplayName("Pinned Notes").description("The notes you pinned, one press away.").supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
struct NotesNoteWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "notes.note", intent: NChooseNote.self, provider: NPickTimeline()) { e in NFam { NNoteView(e: e, family: $0) } }
      .configurationDisplayName("Note").description("One note: its text and its checklist. A locked note shows only its title.").supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
struct NotesRecentWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "notes.recent", provider: NPlain()) { e in NFam { NRecentView(e: e, family: $0) } }
      .configurationDisplayName("Recent Notes").description("The notes you changed last, and a way to jot a new one.").supportedFamilies([.systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline])
  }
}
struct NotesJotWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "notes.jot", provider: NPlain()) { _ in NFam { NJotView(family: $0) } }
      .configurationDisplayName("Jot a Note").description("One press, and you are writing.").supportedFamilies([.systemSmall, .accessoryCircular])
  }
}
