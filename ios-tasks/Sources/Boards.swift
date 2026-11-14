// Sleek Tasks for iPhone: your boards, and one board.
//
//   A board on a phone is one column at a time; the next peeks in from the side, and a flick changes
//   column. A card moves on to the next column with one press (or to any column from a long press).
//   Boards is also where you find a task by its words, and where a copy of everything is saved to a
//   file or brought in from one: that file is how tasks move between this app and Sleek Tasks on the web.
import SwiftUI
import UniformTypeIdentifiers

struct BoardsView: View {
  @ObservedObject var s: Store; @ObservedObject var shell: Shell
  @State private var open: Board?
  @State private var task: Item?
  @State private var query = ""
  @State private var adding = false
  @State private var name = ""
  @State private var saving = false
  @State private var bringing = false
  @State private var file = TasksFile(text: "")
  var body: some View {
    let found = s.found(query)
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        HStack(alignment: .firstTextBaseline) {
          Text("Boards").font(.system(size: 40, weight: .bold)).tracking(-1.2)
          Spacer()
          Menu {
            Button { name = ""; adding = true } label: { Label("New Board", systemImage: "plus") }
            Divider()
            Button { file = TasksFile(text: s.text); saving = true } label: { Label("Save a Copy of Everything…", systemImage: "square.and.arrow.up") }
            Button { bringing = true } label: { Label("Bring In a Copy…", systemImage: "square.and.arrow.down") }
          } label: { Image(systemName: "ellipsis").font(.system(size: 17, weight: .semibold)).frame(width: 40, height: 40).background(Color.primary.opacity(0.07), in: Circle()) }.foregroundStyle(.primary)
        }
        HStack(spacing: 8) { Image(systemName: "magnifyingglass").foregroundStyle(.secondary); TextField("Find a task", text: $query).autocorrectionDisabled(); if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary) } } }
          .padding(.horizontal, 14).frame(height: 46).background(Color(.secondarySystemBackground), in: Capsule())
        if !query.trimmingCharacters(in: .whitespaces).isEmpty {
          if found.isEmpty { Text("No task has those words.").font(.system(size: 16)).foregroundStyle(.secondary).padding(.top, 8) }
          ForEach(found) { t in
            let b = s.board(t.board)
            Button { tap(); task = t } label: {
              HStack(spacing: 12) { Image(systemName: t.done ? "checkmark.circle.fill" : "circle").font(.system(size: 20)).foregroundStyle(t.done ? Color.tasks : Color.secondary.opacity(0.6))
                VStack(alignment: .leading, spacing: 2) { Text(t.title).font(.system(size: 16, weight: .medium)).foregroundStyle(t.done ? .secondary : .primary).strikethrough(t.done, color: .secondary).lineLimit(2).multilineTextAlignment(.leading); Text((b?.name ?? "") + (t.due.isEmpty || t.done ? "" : " · " + Day.word(t.due))).font(.system(size: 13)).foregroundStyle(.secondary) }
                Spacer(minLength: 0) }.padding(.vertical, 6).contentShape(Rectangle())
            }.buttonStyle(.plain)
          }
        } else {
          ForEach(s.boards) { b in card(b) }
          Button { tap(); name = ""; adding = true } label: { Label("New board", systemImage: "plus").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.tasks).frame(maxWidth: .infinity).frame(height: 54).background(Color.tasks.opacity(0.1), in: RoundedRectangle(cornerRadius: 22, style: .continuous)) }.buttonStyle(Press())
        }
      }.padding(.horizontal, 22).padding(.bottom, 30).animation(.spring(response: 0.35, dampingFraction: 0.85), value: s.boards)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(alignment: .top) { Bloom() }
    .navigationDestination(item: $open) { b in BoardView(s: s, shell: shell, id: b.id) }
    .taskSheet($task, s, shell)
    .alert("New board", isPresented: $adding) { TextField("Its name", text: $name); Button("Cancel", role: .cancel) {}; Button("Add") { let id = s.addBoard(name); if let b = s.board(id) { open = b } } }
    .fileExporter(isPresented: $saving, document: file, contentType: .sleek, defaultFilename: "Sleek Tasks " + Day.today) { r in file = TasksFile(text: ""); if case .success = r { shell.say("Saved. Open it in Sleek Tasks anywhere to bring your tasks in.") } }
    .fileImporter(isPresented: $bringing, allowedContentTypes: [.sleek, .json, .data]) { r in if case .success(let u) = r { bring(u, into: s, shell) } }
    .onAppear { if Args.arg("--open") == "board", open == nil { open = s.boards.first } }
  }
  private func card(_ b: Board) -> some View {
    let mine = s.items.filter { $0.board == b.id }, left = mine.filter { !$0.done }.sorted { $0.order < $1.order }, c = Color(hex: b.color)
    return Button { tap(); open = b } label: {
      VStack(alignment: .leading, spacing: 10) {
        HStack { Circle().fill(c).frame(width: 12, height: 12); Text(b.name).font(.system(size: 21, weight: .bold)).lineLimit(1); Spacer(); Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(.tertiary) }
        GeometryReader { g in ZStack(alignment: .leading) { Capsule().fill(c.opacity(0.16)); Capsule().fill(c).frame(width: mine.isEmpty ? 0 : g.size.width * CGFloat(mine.count - left.count) / CGFloat(mine.count)) } }.frame(height: 5)
        if left.isEmpty { Text(mine.isEmpty ? "Nothing here yet" : "All done").font(.system(size: 15)).foregroundStyle(.secondary) }
        ForEach(left.prefix(2)) { t in HStack(spacing: 8) { Circle().stroke(Color.secondary.opacity(0.5), lineWidth: 1.5).frame(width: 14, height: 14); Text(t.title).font(.system(size: 15)).foregroundStyle(.secondary).lineLimit(1) } }
      }
      .padding(18).foregroundStyle(.primary)
      .background { ZStack { RoundedRectangle(cornerRadius: 26, style: .continuous).fill(c.opacity(0.3)).blur(radius: 18).offset(y: 10).padding(10); RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Color(.secondarySystemBackground)) } }
    }.buttonStyle(Press())
  }
}

struct BoardView: View {
  @ObservedObject var s: Store; @ObservedObject var shell: Shell; let id: String
  @Environment(\.dismiss) private var dismiss
  @State private var at: String?
  @State private var open: Item?
  @State private var asking = ""           // "name", "column", "rename": which name is being asked for
  @State private var name = ""
  @State private var sureColumn = false
  @State private var sureBoard = false
  var body: some View {
    if let board = s.board(id) {
      let c = Color(hex: board.color), here = at ?? board.columns[0].id
      VStack(spacing: 12) {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) { ForEach(board.columns) { col in
            Button { tap(); withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { at = col.id } } label: { Text(col.name).font(.system(size: 14, weight: .semibold)).padding(.horizontal, 14).frame(height: 34).foregroundStyle(here == col.id ? .white : .primary).background(here == col.id ? AnyShapeStyle(c) : AnyShapeStyle(Color.primary.opacity(0.07)), in: Capsule()) }.buttonStyle(Press()) } }.padding(.horizontal, 20)
        }.animation(.spring(response: 0.35, dampingFraction: 0.8), value: at)
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHStack(alignment: .top, spacing: 12) { ForEach(Array(board.columns.enumerated()), id: \.element.id) { i, col in column(board, col, i, c).containerRelativeFrame(.horizontal) { w, _ in w * 0.86 }.id(col.id) } }.scrollTargetLayout()
        }
        .scrollTargetBehavior(.viewAligned).scrollPosition(id: $at).contentMargins(.horizontal, 20, for: .scrollContent)
      }
      .navigationTitle(board.name).navigationBarTitleDisplayMode(.inline)
      .background(alignment: .top) { Bloom(c: c) }
      .toolbar { ToolbarItem(placement: .topBarTrailing) { Menu {
        Button { name = board.name; asking = "name" } label: { Label("Rename Board", systemImage: "pencil") }
        Menu { ForEach(Store.colors, id: \.self) { x in Button { withAnimation { s.setBoard(id, color: x) } } label: { Label(["#12A36A": "Green", "#0A84FF": "Blue", "#7C5CFF": "Violet", "#F0642D": "Orange", "#E0457B": "Pink", "#C2A21E": "Gold", "#5B6470": "Slate"][x] ?? x, systemImage: board.color == x ? "checkmark.circle.fill" : "circle.fill") } } } label: { Label("Colour", systemImage: "paintpalette") }
        Divider()
        Button { name = ""; asking = "column" } label: { Label("Add a Column", systemImage: "plus.rectangle.portrait") }
        Button { name = board.columns.first { $0.id == here }?.name ?? ""; asking = "rename" } label: { Label("Rename This Column", systemImage: "character.cursor.ibeam") }
        if board.columns.count > 1 { Button(role: .destructive) { sureColumn = true } label: { Label("Delete This Column", systemImage: "rectangle.portrait.slash") } }
        Divider()
        Button(role: .destructive) { sureBoard = true } label: { Label("Delete Board", systemImage: "trash") }
      } label: { Image(systemName: "ellipsis.circle") } } }
      .taskSheet($open, s, shell)
      .alert(asking == "name" ? "Rename board" : asking == "column" ? "New column" : "Rename column", isPresented: Binding(get: { !asking.isEmpty }, set: { if !$0 { asking = "" } })) {
        TextField("Name", text: $name); Button("Cancel", role: .cancel) {}
        Button("Save") { let what = asking; withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { if what == "name" { s.setBoard(id, name: name) } else if what == "column" { s.addColumn(id, name) } else { s.renameColumn(id, here, name) } } }
      }
      .confirmationDialog("Delete this column? Its tasks move to the first column.", isPresented: $sureColumn, titleVisibility: .visible) { Button("Delete Column", role: .destructive) { withAnimation { s.removeColumn(id, here); at = nil } } }
      .confirmationDialog("Delete “\(board.name)” and every task on it?", isPresented: $sureBoard, titleVisibility: .visible) { Button("Delete Board", role: .destructive) { dismiss(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { withAnimation { s.removeBoard(id) } } } }
    }
  }
  private func column(_ board: Board, _ col: Column, _ i: Int, _ c: Color) -> some View {
    let cards = s.cards(board.id, col.id), next = i + 1 < board.columns.count ? board.columns[i + 1] : nil
    return ScrollView {
      VStack(alignment: .leading, spacing: 10) {
        ForEach(cards) { t in
          HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
              Text(t.title).font(.system(size: 16, weight: .medium)).strikethrough(t.done, color: .secondary).foregroundStyle(t.done ? .secondary : .primary).multilineTextAlignment(.leading)
              if !t.due.isEmpty && !t.done { Text(Day.word(t.due)).font(.system(size: 13)).foregroundStyle(t.due < Day.today ? .red : .secondary) }
            }
            Spacer(minLength: 0)
            if let n = next { Button { tap(.medium); withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) { s.move(t.id, to: n.id) } } label: { Image(systemName: n.done ? "checkmark" : "arrow.right").font(.system(size: 13, weight: .bold)).foregroundStyle(c).frame(width: 34, height: 34).background(c.opacity(0.14), in: Circle()) }.buttonStyle(Press()) }
          }
          .padding(14).background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous)).shadow(color: .black.opacity(0.07), radius: 8, y: 3)
          .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous)).onTapGesture { tap(); open = t }
          .contextMenu { ForEach(board.columns) { x in if x.id != col.id { Button { withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) { s.move(t.id, to: x.id) } } label: { Label("Move to " + x.name, systemImage: "arrow.right") } } }; Button(role: .destructive) { withAnimation { s.removeTask(t.id) } } label: { Label("Delete", systemImage: "trash") } }
          .transition(.scale(scale: 0.9).combined(with: .opacity))
        }
        if !col.done { NewCard(s: s, board: board.id, column: col.id, c: c) }
      }.padding(12)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(Color(.secondarySystemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    .padding(.bottom, 12)
  }
}
struct NewCard: View {
  @ObservedObject var s: Store; let board: String, column: String, c: Color
  @State private var text = ""
  @FocusState private var typing: Bool
  var body: some View {
    HStack(spacing: 8) { Image(systemName: "plus").font(.system(size: 14, weight: .semibold)).foregroundStyle(c)
      TextField("Add a card", text: $text).focused($typing).submitLabel(.done).onSubmit { let had = !text.trimmingCharacters(in: .whitespaces).isEmpty; if had { tap(.medium); withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { _ = s.addTask(text, board: board, column: column) } }; text = ""; typing = had } }
      .padding(.horizontal, 14).frame(height: 46).background(Color(.systemBackground).opacity(typing ? 1 : 0.5), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}
