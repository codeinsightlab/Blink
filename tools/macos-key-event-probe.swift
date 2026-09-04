import AppKit

private func describe(_ source: String, _ event: NSEvent) {
    let flags = event.modifierFlags
        .intersection(.deviceIndependentFlagsMask)
        .rawValue
    let characters = event.characters ?? "<nil>"
    let ignoringModifiers = event.charactersIgnoringModifiers ?? "<nil>"
    let specialKey: String
    if #available(macOS 10.15, *) {
        specialKey = event.specialKey.map(String.init(describing:)) ?? "<nil>"
    } else {
        specialKey = "<unavailable>"
    }
    print(
        "source=\(source) type=\(event.type.rawValue) keyCode=\(event.keyCode) " +
        "flags=0x\(String(flags, radix: 16)) characters=\(String(reflecting: characters)) " +
        "charactersIgnoringModifiers=\(String(reflecting: ignoringModifiers)) " +
        "specialKey=\(specialKey) repeat=\(event.isARepeat)"
    )
    fflush(stdout)
}

let mask: NSEvent.EventTypeMask = [.keyDown, .keyUp]

guard let globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: mask, handler: {
    describe("global", $0)
}) else {
    fputs("Unable to install NSEvent global monitor. Check Input Monitoring permission.\n", stderr)
    exit(2)
}

let localMonitor = NSEvent.addLocalMonitorForEvents(matching: mask) {
    describe("local", $0)
    return $0
}

print("Listening for F13, F16, F20 and F24. Focus another app for global events; press Control-C to stop.")
fflush(stdout)

withExtendedLifetime((globalMonitor, localMonitor)) {
    RunLoop.main.run()
}
