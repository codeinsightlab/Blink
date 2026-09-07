import AppKit
import CoreGraphics

print("Blink macOS Space probe")
print("macOS: \(ProcessInfo.processInfo.operatingSystemVersionString)")
print("Displays: \(NSScreen.screens.count)")
for (index, screen) in NSScreen.screens.enumerated() {
    let frame = screen.frame
    let id = screen.deviceDescription[ NSDeviceDescriptionKey("NSScreenNumber") ] as? CGDirectDisplayID
    print("display[\(index)] id=\(id.map(String.init) ?? \"unknown\") frame=\(frame)")
}

let workspace = NSWorkspace.shared
print("frontmost application: \(workspace.frontmostApplication?.bundleIdentifier ?? \"unknown\")")
print("public Space identifier query: UNSUPPORTED")
print("public Space creation: UNSUPPORTED")
print("public Space activation by identifier: UNSUPPORTED")
print("AX window position/size: available with Accessibility permission; Space membership: NOT EXPOSED")
print("No Mission Control UI, private framework, window move, or Space mutation performed.")
