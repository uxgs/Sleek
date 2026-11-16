// Sleek Tasks for iPhone: a grocery list, its own screen.
//
//   Made for the shop, one-handed. The add bar is docked under your thumb and stays up for the next thing; type
//   "2 lemons" or "lemons x3" and what you have bought before is offered above the keyboard. Your usuals are one
//   tap away under Add again (press and hold one to stop it being offered). Things sort themselves by aisle;
//   press and hold a thing to move it to another aisle, and it goes there from now on. Tap a number for − and +.
//   Ticked things drop into the basket. Done shopping finishes the list, and what was not got can start the next.
//   The rules are the store's (Store.swift, "grocery lists"), the same as Sleek Tasks on the web.
import SwiftUI

struct GroceryView: View {
  @ObservedObject var s: Store; @ObservedObject var shell: Shell; let id: String
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var basket = false
  @State private var step: String?
  @State private var asking = false
  @State private var picking = false
  @State private var sure = false
  @State private var fresh: String?
  @State private var gone: Set<String> = []
  @State private var next: String?
  var body: some View {
    if let l = s.board(id) {
      let all = s.things(id), left = all.filter { !$0.done }, got = all.filter(\.done).sorted { $0.doneAt > $1.doneAt }
      ScrollViewReader { reader in
        ScrollView {
          if l.shopped { shopped(l, got.count) } else {
            VStack(alignment: .leading, spacing: 0) {
              header(l, got.count, all.count, left.count)
              usuals(l)
              if all.isEmpty { Text(s.offer(id).isEmpty ? "Type what you need below. What you add is remembered, so next time it is one tap away." : "Type what you need below, or tap one of your usuals.").font(.system(size: 16)).foregroundStyle(.secondary).frame(maxWidth: .infinity).multilineTextAlignment(.center).padding(24).background(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Color.secondary.opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [5]))).padding(.top, 8) }
              ForEach(Aisle.walk) { a in
                let mine = left.filter { $0.aisle == a.id }
                if !mine.isEmpty {
                  HStack(spacing: 8) { RoundedRectangle(cornerRadius: 2).fill(Color(hex: a.color)).frame(width: 8, height: 8); Text(a.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary); Spacer(); Text("\(mine.count)").font(.system(size: 13)).foregroundStyle(.tertiary) }.padding(.top, 20).padding(.bottom, 2)
                  ForEach(mine) { t in row(t).id(t.id) }
                }
              }
              if !got.isEmpty {
                VStack(spacing: 0) {
                  Button { tap(); withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { basket.toggle() } } label: {
                    HStack(spacing: 8) { Image(systemName: "basket.fill").foregroundStyle(Color.tasks); Text("In the basket").font(.system(size: 15, weight: .semibold)); Text("\(got.count)").foregroundStyle(.secondary); Spacer(); Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold)).foregroundStyle(.tertiary).rotationEffect(.degrees(basket ? 90 : 0)) }
                      .padding(.horizontal, 16).frame(height: 52).contentShape(Rectangle())
                  }.buttonStyle(.plain)
                  if basket { VStack(spacing: 0) { ForEach(got) { t in row(t) } }.padding(.horizontal, 16).padding(.bottom, 4).transition(.opacity.combined(with: .move(edge: .top))) }
                }.background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 20, style: .continuous)).padding(.top, 20)
                Button { tap(.medium); if left.isEmpty { finish(false) } else { asking = true } } label: { Text("Done shopping").font(.system(size: 17, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 56).foregroundStyle(Color(.systemBackground)).background(Color.primary, in: Capsule()) }.buttonStyle(Press()).padding(.top, 16)
              }
            }.padding(.horizontal, 20).padding(.bottom, 24)
            .animation(.spring(response: 0.45, dampingFraction: 0.85), value: all)
          }
        }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: fresh) { _, f in if let f = f { withAnimation { reader.scrollTo(f, anchor: .center) } } }
      }
      .background(alignment: .top) { Bloom(c: Color(hex: l.color)) }
      .safeAreaInset(edge: .bottom) { if !l.shopped { ThingBar(s: s, list: id, focus: shell.takeAdding()) { made in fresh = made; DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { if fresh == made { fresh = nil } } } } }
      .navigationTitle("").navigationBarTitleDisplayMode(.inline)
      .toolbar(.hidden, for: .tabBar)
      .toolbar { ToolbarItem(placement: .topBarTrailing) { Menu {
        Button { picking = true } label: { Label("Day", systemImage: "calendar") }
        if l.shopped { Button { s.reopenList(id) } label: { Label("Open It Again", systemImage: "arrow.uturn.left") } }
        Divider()
        Button(role: .destructive) { sure = true } label: { Label("Delete List", systemImage: "trash") }
      } label: { Image(systemName: "ellipsis.circle") } } }
      .confirmationDialog("\(left.count) \(left.count == 1 ? "thing" : "things") not got. Keep \(left.count == 1 ? "it" : "them") for the next shop?", isPresented: $asking, titleVisibility: .visible) {
        Button("Start the Next List with \(left.count == 1 ? "It" : "Them")") { finish(true) }
        Button("Just Finish") { finish(false) }
      }
      .confirmationDialog("Delete “\(l.name)”?", isPresented: $sure, titleVisibility: .visible) { Button("Delete List", role: .destructive) { dismiss(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { withAnimation { s.removeBoard(id) } } } }
      .sheet(isPresented: $picking) { DaySheet(s: s, id: id).presentationDetents([.height(420)]).presentationCornerRadius(30) }
      .navigationDestination(item: $next) { n in GroceryView(s: s, shell: shell, id: n) }
      .onAppear { name = l.name }
    }
  }
  private func finish(_ carry: Bool) {
    withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { basket = false; let n = s.finishList(id, carry: carry); if let n = n { shell.say("The next list has \(s.things(n).count) \(s.things(n).count == 1 ? "thing" : "things") on it already.") } }
    UINotificationFeedbackGenerator().notificationOccurred(.success)
  }
  // ---------- the top: its name, the ring, the day ----------
  private func header(_ l: Board, _ got: Int, _ all: Int, _ left: Int) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("GROCERY LIST").font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary)
      HStack(alignment: .center, spacing: 16) {
        TextField("Name", text: $name, axis: .vertical).font(.system(size: 36, weight: .bold)).tracking(-1).submitLabel(.done)
          .onChange(of: name) { _, v in if v.contains("\n") { name = v.replacingOccurrences(of: "\n", with: ""); hideKeyboard() } else if !v.trimmingCharacters(in: .whitespaces).isEmpty { s.setBoard(id, name: v) } }
        ZStack {
          Circle().stroke(Color.primary.opacity(0.1), lineWidth: 5)
          Circle().trim(from: 0, to: all == 0 ? 0 : CGFloat(got) / CGFloat(all)).stroke(Color.tasks, style: StrokeStyle(lineWidth: 5, lineCap: .round)).rotationEffect(.degrees(-90)).animation(.spring(response: 0.6, dampingFraction: 0.8), value: got)
          Text("\(got)/\(all)").font(.system(size: 13, weight: .bold)).monospacedDigit().contentTransition(.numericText())
        }.frame(width: 56, height: 56).accessibilityElement().accessibilityLabel("\(got) of \(all) in the basket")
      }
      HStack(spacing: 8) {
        Button { tap(); picking = true } label: { Label(l.due.isEmpty ? "No day" : Day.word(l.due), systemImage: "calendar").font(.system(size: 14, weight: .semibold)).padding(.horizontal, 14).frame(height: 34).foregroundStyle(l.due.isEmpty ? Color.primary : Color.tasks).background(l.due.isEmpty ? Color.primary.opacity(0.07) : Color.tasks.opacity(0.14), in: Capsule()).frame(minHeight: 44).contentShape(Rectangle()) }.buttonStyle(Press())
        Text(left > 0 ? "\(left) to get" : all > 0 ? "All in the basket" : "Nothing on it yet").font(.system(size: 14, weight: .semibold)).padding(.horizontal, 14).frame(height: 34).background(Color.primary.opacity(0.07), in: Capsule())
      }.padding(.top, 8)
    }.padding(.top, 4)
  }
  // ---------- Add again ----------
  @ViewBuilder private func usuals(_ l: Board) -> some View {
    let u = s.offer(id)
    if !u.isEmpty {
      HStack { Text("ADD AGAIN").font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary); Spacer(); Text("your usuals").font(.system(size: 13)).foregroundStyle(.tertiary) }.padding(.top, 20)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) { ForEach(u) { x in
          Button { tap(.medium); withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { _ = gone.insert(x.name) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) { let made = s.addThing(x.name, to: id, qty: 1); gone.remove(x.name); fresh = made } }
          } label: {
            HStack(spacing: 8) { Image(systemName: "plus").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.tasks).frame(width: 24, height: 24).background(Color.tasks.opacity(0.14), in: Circle()); Text(x.name).font(.system(size: 15, weight: .medium)).lineLimit(1) }
              .padding(.leading, 6).padding(.trailing, 14).frame(height: 38).background(.ultraThinMaterial, in: Capsule()).overlay(Capsule().stroke(Color.primary.opacity(0.1), lineWidth: 1)).frame(minHeight: 44).contentShape(Rectangle())
          }.buttonStyle(Press())
          .scaleEffect(gone.contains(x.name) ? 0.7 : 1).opacity(gone.contains(x.name) ? 0 : 1).offset(y: gone.contains(x.name) ? -10 : 0)
          .contextMenu { Button { withAnimation { s.stopOffering(x.name) }; shell.say("“\(x.name)” won’t be offered again. Add it once more to bring it back.") } label: { Label("Stop Offering “\(x.name)”", systemImage: "hand.raised") } }
          .transition(.scale.combined(with: .opacity))
        } }.padding(.horizontal, 20).padding(.vertical, 2)
      }.padding(.horizontal, -20).padding(.top, 8)
      .animation(.spring(response: 0.4, dampingFraction: 0.85), value: u)
    }
  }
  // ---------- one thing ----------
  private func row(_ t: Item) -> some View {
    HStack(spacing: 12) {
      Button { tap(.medium); withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { s.tick(t.id) } } label: {
        ZStack { Circle().stroke(t.done ? Color.tasks : Color.secondary.opacity(0.45), lineWidth: 2).background(Circle().fill(t.done ? Color.tasks : .clear)); if t.done { Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(.white).transition(.scale.combined(with: .opacity)) } }
          .frame(width: 28, height: 28).frame(width: 44, height: 44).contentShape(Rectangle())
      }.buttonStyle(Press()).padding(.leading, -8).accessibilityLabel((t.done ? "Put back: " : "Got: ") + t.title)
      Text(t.title).font(.system(size: 17)).strikethrough(t.done, color: .secondary).foregroundStyle(t.done ? .secondary : .primary).frame(maxWidth: .infinity, alignment: .leading)
      if t.done { if t.qty > 1 { Text("×\(t.qty)").font(.system(size: 14)).foregroundStyle(.tertiary) } }
      else if step == t.id {
        HStack(spacing: 2) {
          Button { tap(); s.setQty(t.id, t.qty - 1) } label: { Image(systemName: "minus").font(.system(size: 14, weight: .bold)).frame(width: 36, height: 32).background(Color(.systemBackground), in: Capsule()) }.disabled(t.qty < 2).accessibilityLabel("One fewer")
          Text("\(t.qty)").font(.system(size: 15, weight: .bold)).monospacedDigit().frame(minWidth: 28).contentTransition(.numericText())
          Button { tap(); s.setQty(t.id, t.qty + 1) } label: { Image(systemName: "plus").font(.system(size: 14, weight: .bold)).frame(width: 36, height: 32).background(Color(.systemBackground), in: Capsule()) }.accessibilityLabel("One more")
        }.foregroundStyle(Color.tasks).padding(3).background(Color.tasks.opacity(0.14), in: Capsule()).transition(.scale(scale: 0.8).combined(with: .opacity))
      } else {
        Button { tap(); withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) { step = t.id } } label: { Text(t.qty == 1 ? "1" : "×\(t.qty)").font(.system(size: 14, weight: t.qty == 1 ? .regular : .bold)).monospacedDigit().foregroundStyle(t.qty == 1 ? .tertiary : .primary).padding(.horizontal, 10).frame(minWidth: 40).frame(height: 30).background(t.qty == 1 ? Color.clear : Color.primary.opacity(0.07), in: Capsule()).frame(minHeight: 44).contentShape(Rectangle()) }.buttonStyle(.plain).accessibilityLabel("How many: \(t.qty). Change")
      }
    }
    .frame(minHeight: 52)
    .background(fresh == t.id ? Color.tasks.opacity(0.14) : .clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay(alignment: .bottom) { Rectangle().fill(Color.primary.opacity(0.08)).frame(height: 0.5) }
    .contentShape(Rectangle())
    .onTapGesture { if step != nil { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { step = nil } } }
    .contextMenu {
      Menu { ForEach(Aisle.walk) { a in Button { withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { s.setAisle(t.id, a.id) }; if a.id != t.aisle { shell.say("“\(t.title)” goes in \(a.name) from now on.") } } label: { Label(a.name, systemImage: a.id == t.aisle ? "checkmark" : "circle.fill") } } } label: { Label("Move to Aisle", systemImage: "arrow.left.arrow.right") }
      Button(role: .destructive) { withAnimation { s.removeTask(t.id) } } label: { Label("Remove from the List", systemImage: "trash") }
    }
    .transition(.asymmetric(insertion: .move(edge: .top).combined(with: .opacity), removal: .opacity))
  }
  // ---------- shopped ----------
  private func shopped(_ l: Board, _ got: Int) -> some View {
    let nx = s.board(l.next)
    return VStack(spacing: 12) {
      ZStack { Circle().fill(Color.tasks).frame(width: 104, height: 104).shadow(color: Color.tasks.opacity(0.5), radius: 30, y: 14); Image(systemName: "checkmark").font(.system(size: 46, weight: .bold)).foregroundStyle(.white) }
        .padding(.top, 60).padding(.bottom, 12).transition(.scale.combined(with: .opacity))
      Text("Shopped.").font(.system(size: 40, weight: .bold)).tracking(-1.2)
      Text("\(l.name): \(got) \(got == 1 ? "thing" : "things").").font(.system(size: 17)).foregroundStyle(.secondary)
      if l.carried > 0, nx != nil { Text("\(l.carried) not got \(l.carried == 1 ? "is" : "are") on the next list.").font(.system(size: 17)).foregroundStyle(.secondary) }
      if let nx = nx, !nx.shopped { Button { tap(); next = nx.id } label: { Text("Open the next list").font(.system(size: 17, weight: .semibold)).padding(.horizontal, 28).frame(height: 52).foregroundStyle(.white).background(Color.tasks, in: Capsule()) }.buttonStyle(Press()).padding(.top, 16) }
      else { Button { tap(); next = s.addList(l.name, due: Store.weekOn(l.due), color: l.color) } label: { Text("Start the next list").font(.system(size: 17, weight: .semibold)).padding(.horizontal, 28).frame(height: 52).foregroundStyle(.white).background(Color.tasks, in: Capsule()) }.buttonStyle(Press()).padding(.top, 16) }
      Button { tap(); withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) { s.reopenList(id) } } label: { Text("Not finished? Open it again").font(.system(size: 15, weight: .medium)).foregroundStyle(.secondary).frame(minHeight: 44) }
    }.frame(maxWidth: .infinity).padding(.horizontal, 20)
  }
}
func hideKeyboard() { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }

/// The add bar for a list, docked under the thumb, with what you have bought before offered above it as you type.
struct ThingBar: View {
  @ObservedObject var s: Store; let list: String; var focus = false; let added: (String?) -> Void
  @State private var text = ""
  @FocusState private var typing: Bool
  var body: some View {
    let sg = typing ? s.suggest(text, list) : []
    VStack(spacing: 8) {
      if !sg.isEmpty {
        VStack(spacing: 0) { ForEach(sg) { u in
          Button { tap(.medium); let p = Store.parse(text); withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) { added(s.addThing(u.name, to: list, qty: p.counted ? p.qty : 1)) }; text = "" } label: {
            HStack { Text(u.name).font(.system(size: 16, weight: .medium)); Spacer(); Text("bought \(u.count) \(u.count == 1 ? "time" : "times")").font(.system(size: 13)).foregroundStyle(.secondary) }.padding(.horizontal, 16).frame(height: 46).contentShape(Rectangle())
          }.buttonStyle(.plain)
        } }.padding(.vertical, 4).modifier(Glass(shape: RoundedRectangle(cornerRadius: 22, style: .continuous))).padding(.horizontal, 16).transition(.move(edge: .bottom).combined(with: .opacity))
      }
      HStack(spacing: 12) {
        Image(systemName: "plus.circle.fill").font(.system(size: 26)).foregroundStyle(Color.tasks)
        TextField("Add an item, like “2 lemons”", text: $text).font(.system(size: 17)).focused($typing).submitLabel(.done).autocorrectionDisabled(false)
          .onSubmit { let had = !text.trimmingCharacters(in: .whitespaces).isEmpty; if had { tap(.medium); withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) { added(s.addThing(text, to: list)) } }; text = ""; typing = had }
        if typing { Button { typing = false } label: { Image(systemName: "keyboard.chevron.compact.down").foregroundStyle(.secondary).frame(width: 44, height: 44).contentShape(Rectangle()) }.padding(.horizontal, -8) }
      }
      .padding(.horizontal, 16).frame(height: 56)
      .modifier(Glass(shape: Capsule()))
      .onAppear { if focus { DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { typing = true } } }
      .overlay(Capsule().stroke(Color.tasks, lineWidth: typing ? 1.6 : 0)).shadow(color: Color.tasks.opacity(typing ? 0.35 : 0), radius: 16, y: 6)
      .padding(.horizontal, 16)
    }
    .padding(.bottom, 8).animation(.spring(response: 0.35, dampingFraction: 0.82), value: typing).animation(.spring(response: 0.35, dampingFraction: 0.85), value: sg)
    .onAppear { if Args.arg("--open") == "list" || s.things(list).isEmpty { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { typing = !Args.proving && s.things(list).isEmpty } } }
  }
}

/// Which day a list is for: it shows on Today from that day until it is shopped.
struct DaySheet: View {
  @ObservedObject var s: Store; let id: String
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    let due = s.board(id)?.due ?? ""
    VStack(alignment: .leading, spacing: 12) {
      Text("Which day?").font(.system(size: 24, weight: .bold)).padding(.top, 28)
      Text("A list with a day shows on Today, here and in the Sleek browser, from that day until it is shopped.").font(.system(size: 15)).foregroundStyle(.secondary)
      HStack(spacing: 8) {
        ForEach([(0, "Today"), (1, "Tomorrow"), (Store.daysToSaturday, Day.word(Day.from(today: Store.daysToSaturday)))].filter { $0.0 != 1 || Store.daysToSaturday != 1 }, id: \.0) { d in
          let key = Day.from(today: d.0)
          Button { tap(); s.setListDue(id, key); dismiss() } label: { Text(d.1).font(.system(size: 15, weight: .semibold)).padding(.horizontal, 16).frame(height: 40).foregroundStyle(due == key ? .white : .primary).background(due == key ? AnyShapeStyle(Color.tasks) : AnyShapeStyle(Color.primary.opacity(0.07)), in: Capsule()).frame(minHeight: 44) }.buttonStyle(Press())
        }
      }
      DatePicker("Another day", selection: Binding(get: { Day.date(due) ?? Date() }, set: { s.setListDue(id, Day.key($0)) }), displayedComponents: .date).font(.system(size: 16, weight: .medium)).frame(minHeight: 44)
      Button { tap(); s.setListDue(id, ""); dismiss() } label: { Label("No day", systemImage: due.isEmpty ? "checkmark" : "minus.circle").font(.system(size: 16, weight: .medium)).frame(minHeight: 44) }.foregroundStyle(due.isEmpty ? Color.tasks : .primary)
      Spacer()
    }.padding(.horizontal, 20)
  }
}

/// A list's card, for Today: its name and day, how far along it is, the first few things to tick off, and Open.
struct ListCard: View {
  @ObservedObject var s: Store; let l: Board; let open: () -> Void
  var body: some View {
    let all = s.things(l.id), left = all.filter { !$0.done }, c = Color(hex: l.color)
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 12) {
        Image(systemName: "basket.fill").font(.system(size: 17)).foregroundStyle(.white).frame(width: 38, height: 38).background(c, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 1) { Text(l.name).font(.system(size: 17, weight: .semibold)).lineLimit(1); Text("Grocery list · \(Day.word(l.due)) · \(left.isEmpty ? "all in the basket" : "\(left.count) to get")").font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1) }
        Spacer(minLength: 0)
        Button { tap(); open() } label: { Text("Open").font(.system(size: 14, weight: .semibold)).padding(.horizontal, 14).frame(height: 32).foregroundStyle(c).background(c.opacity(0.14), in: Capsule()).frame(minHeight: 44).contentShape(Rectangle()) }.buttonStyle(Press())
      }
      GeometryReader { g in ZStack(alignment: .leading) { Capsule().fill(Color.primary.opacity(0.08)); Capsule().fill(c).frame(width: all.isEmpty ? 0 : g.size.width * CGFloat(all.count - left.count) / CGFloat(all.count)) } }.frame(height: 5).padding(.top, 12).padding(.bottom, 4)
      ForEach(left.prefix(4)) { t in
        HStack(spacing: 12) {
          Button { tap(.medium); withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { s.tick(t.id) } } label: { Circle().stroke(Color.secondary.opacity(0.45), lineWidth: 2).frame(width: 24, height: 24).frame(width: 44, height: 44).contentShape(Rectangle()) }.buttonStyle(Press()).padding(.leading, -10).accessibilityLabel("Got: " + t.title)
          Text(t.title).font(.system(size: 16)); Spacer(); if t.qty > 1 { Text("×\(t.qty)").font(.system(size: 14)).foregroundStyle(.tertiary) }
        }.frame(minHeight: 44).transition(.opacity.combined(with: .move(edge: .top)))
      }
      if left.count > 4 { Text("and \(left.count - 4) more").font(.system(size: 14)).foregroundStyle(.secondary).padding(.vertical, 6) }
      if left.isEmpty { Text("Everything is in the basket.").font(.system(size: 14)).foregroundStyle(.secondary).padding(.vertical, 8) }
    }
    .padding(16)
    .background { ZStack { RoundedRectangle(cornerRadius: 24, style: .continuous).fill(c.opacity(0.25)).blur(radius: 16).offset(y: 8).padding(12); RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color(.secondarySystemBackground)) } }
    .animation(.spring(response: 0.45, dampingFraction: 0.85), value: all)
  }
}

extension Store { static var daysToSaturday: Int { let w = Calendar.current.component(.weekday, from: Date()); return (7 - w + 7) % 7 == 0 ? 7 : (7 - w + 7) % 7 } }
