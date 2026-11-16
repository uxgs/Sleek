// The rules a grocery list follows, shared by Sleek Tasks and the Sleek browser (whose Siri answers read your lists):
// the aisles of a shop and how a thing is put in one, and how "2 lemons" is read. The same as core/task-store.js.
import Foundation

/// The aisles of a shop, in the order you walk them, with the words that put a thing in each.
struct Aisle: Identifiable, Hashable {
  let id: String, name: String, color: String, words: [String]
  static let all: [Aisle] = [
    Aisle(id: "produce", name: "Produce", color: "#34C759", words: "banana apple avocado lemon lime tomato spinach lettuce onion garlic potato carrot pepper cucumber berries strawberr blueberr raspberr grape orange pear peach plum melon herb basil coriander cilantro parsley mint ginger mushroom broccoli cauliflower courgette zucchini aubergine eggplant kale salad fruit veg celery leek squash pumpkin corn beetroot rocket".split(separator: " ").map(String.init)),
    Aisle(id: "bakery", name: "Bakery", color: "#E8A23A", words: "bread sourdough bagel croissant bun roll tortilla wrap pitta pita baguette muffin loaf naan crumpet cake brioche".split(separator: " ").map(String.init)),
    Aisle(id: "dairy", name: "Dairy and eggs", color: "#5AA9F7", words: "milk egg butter cheese cheddar yogurt yoghurt cream feta mozzarella parmesan halloumi ricotta custard".split(separator: " ").map(String.init)),
    Aisle(id: "meat", name: "Meat and fish", color: "#E5484D", words: "chicken beef pork mince sausage bacon salmon fish prawn shrimp tuna lamb turkey thigh steak ham chorizo cod".split(separator: " ").map(String.init)),
    Aisle(id: "pantry", name: "Pantry", color: "#B07A4F", words: "pasta spaghetti noodle rice oil olive flour sugar salt pepper_corns beans lentil chickpea cereal oat granola coffee tea honey jam sauce stock spice chocolate nuts crisps chips biscuit cracker vinegar mustard ketchup mayo peanut peanut_butter tinned".split(separator: " ").map(String.init)),
    Aisle(id: "frozen", name: "Frozen", color: "#7FD1E8", words: "frozen ice_cream ice peas pizza".split(separator: " ").map(String.init)),
    Aisle(id: "drinks", name: "Drinks", color: "#AF52DE", words: "water juice wine beer soda sparkling kombucha cola lemonade gin".split(separator: " ").map(String.init)),
    Aisle(id: "home", name: "Household", color: "#8E8E93", words: "soap towel paper detergent toilet bin bag foil sponge tissue shampoo conditioner toothpaste toothbrush kitchen_roll toilet_roll bin_bags washing_up cling_film battery bulb candle nappies".split(separator: " ").map(String.init)),
  ]
  static let other = Aisle(id: "other", name: "Other", color: "#A1A1A6", words: [])
  static var walk: [Aisle] { all + [other] }
  static func of(id: String) -> Aisle { walk.first { $0.id == id } ?? other }
  /// Sleek's guess from the name: a word in it that starts like one of an aisle's; the longest such wins ("kitchen roll" over "roll").
  static func guess(_ name: String) -> String {
    let n = " " + Grocer.norm(name) + " "; var best = "other", len = 0
    for a in all { for w in a.words { let w = w.replacingOccurrences(of: "_", with: " "); if w.count > len && n.contains(" " + w) { best = a.id; len = w.count } } }
    return best
  }
}

enum Grocer {
  /// A name as it is compared: single spaces, lower case.
  static func norm(_ s: String) -> String { s.split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased() }
  /// "2 lemons", "lemons x3", "lemons ×3", or just "lemons".
  static func parse(_ typed: String) -> (name: String, qty: Int, counted: Bool) {
    let s = typed.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    var name = s, qty = 1, counted = false
    if let m = s.firstMatch(of: /^(\d{1,3})\s*(?:[xX×])?\s+(.+)$/) { qty = Int(m.1) ?? 1; name = String(m.2); counted = true }
    else if let m = s.firstMatch(of: /^(.+?)\s*[xX×]\s*(\d{1,3})$/) { name = String(m.1); qty = Int(m.2) ?? 1; counted = true }
    name = String(name.trimmingCharacters(in: .whitespaces).prefix(120))
    return (name.prefix(1).uppercased() + name.dropFirst(), max(1, min(999, qty)), counted)
  }
}
