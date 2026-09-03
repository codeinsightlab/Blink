// Isolated native QA app. Never reads or writes user documents.
import AppKit
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let windows = (0..<2).map { index -> NSWindow in
    let window = NSWindow(contentRect:NSRect(x:300+index*50,y:300+index*50,width:380,height:180),styleMask:[.titled,.closable,.miniaturizable],backing:.buffered,defer:false)
    window.title = "Blink Toggle fixture \(index+1)"
    window.makeKeyAndOrderFront(nil)
    return window
}
app.activate(ignoringOtherApps:true)
let control = "/tmp/blink-toggle-fixture-command"
try? FileManager.default.removeItem(atPath:control)
let timer = Timer.scheduledTimer(withTimeInterval:0.1,repeats:true) { _ in
    guard let command = try? String(contentsOfFile:control,encoding:.utf8) else { return }
    try? FileManager.default.removeItem(atPath:control)
    switch command {
    case "hide": app.hide(nil)
    case "minimize": windows.forEach { $0.miniaturize(nil) }
    case "partial": windows[0].miniaturize(nil)
    case "reveal": app.unhide(nil); windows.forEach { $0.deminiaturize(nil) }; app.activate(ignoringOtherApps:true)
    default: break
    }
}
DispatchQueue.main.asyncAfter(deadline:.now()+60) { app.terminate(nil) }
app.run()
