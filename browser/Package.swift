// swift-tools-version:5.9
// Sleek, the browser: a Mac app on the system's own web engine. See README.md in this folder.
import PackageDescription
let package = Package(name: "Sleek", platforms: [.macOS(.v14)], targets: [ .executableTarget(name: "Sleek", path: "Sources/Sleek") ])
