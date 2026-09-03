//! Win32 shell icon extraction, without launching the executable.
use std::{ffi::c_void, os::windows::ffi::OsStrExt, path::Path, ptr};
type Handle = *mut c_void;
#[repr(C)]
struct FileInfo {
    icon: Handle,
    index: i32,
    attributes: u32,
    display: [u16; 260],
    type_name: [u16; 80],
}
#[repr(C)]
struct BitmapHeader {
    size: u32,
    width: i32,
    height: i32,
    planes: u16,
    bits: u16,
    compression: u32,
    image_size: u32,
    x: i32,
    y: i32,
    used: u32,
    important: u32,
}
#[repr(C)]
struct BitmapInfo {
    header: BitmapHeader,
    colors: [u32; 1],
}
#[link(name = "shell32")]
extern "system" {
    fn ExtractIconExW(
        path: *const u16,
        index: i32,
        large: *mut Handle,
        small: *mut Handle,
        count: u32,
    ) -> u32;
    fn SHGetFileInfoW(
        path: *const u16,
        attributes: u32,
        info: *mut FileInfo,
        size: u32,
        flags: u32,
    ) -> usize;
}
#[link(name = "ole32")]
extern "system" {
    fn CoInitializeEx(reserved: Handle, mode: u32) -> i32;
    fn CoUninitialize();
}
struct ComApartment;
impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}
#[link(name = "user32")]
extern "system" {
    fn DestroyIcon(icon: Handle) -> i32;
    fn DrawIconEx(
        dc: Handle,
        x: i32,
        y: i32,
        icon: Handle,
        width: i32,
        height: i32,
        step: u32,
        brush: Handle,
        flags: u32,
    ) -> i32;
}
#[link(name = "gdi32")]
extern "system" {
    fn CreateCompatibleDC(dc: Handle) -> Handle;
    fn DeleteDC(dc: Handle) -> i32;
    fn CreateDIBSection(
        dc: Handle,
        info: *const BitmapInfo,
        usage: u32,
        bits: *mut *mut c_void,
        section: Handle,
        offset: u32,
    ) -> Handle;
    fn SelectObject(dc: Handle, object: Handle) -> Handle;
    fn DeleteObject(object: Handle) -> i32;
    fn GdiFlush() -> i32;
}
struct Icon(Handle);
impl Drop for Icon {
    fn drop(&mut self) {
        unsafe {
            DestroyIcon(self.0);
        }
    }
}

pub(super) fn extract(path: &Path) -> Option<Vec<u8>> {
    if !path.is_file() || !path.extension()?.to_str()?.eq_ignore_ascii_case("exe") {
        return None;
    }
    let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    if path[..path.len() - 1].contains(&0) {
        return None;
    }
    unsafe {
        if CoInitializeEx(ptr::null_mut(), 2) < 0 {
            return None;
        }
        let _com = ComApartment;
        let count = ExtractIconExW(path.as_ptr(), -1, ptr::null_mut(), ptr::null_mut(), 0);
        if count == 0 || count == u32::MAX {
            return None;
        }
        let mut info: FileInfo = std::mem::zeroed();
        // SHGFI_ICON | SHGFI_LARGEICON: shell resolves the executable's native icon.
        if SHGetFileInfoW(
            path.as_ptr(),
            0,
            &mut info,
            std::mem::size_of::<FileInfo>() as u32,
            0x100,
        ) == 0
            || info.icon.is_null()
        {
            return None;
        }
        let icon = Icon(info.icon);
        let black = render(icon.0, 0)?;
        let white = render(icon.0, 255)?;
        // Recover transparency from black/white composites, including legacy mask icons.
        let mut rgba = Vec::with_capacity(64 * 64 * 4);
        for (b, w) in black.chunks_exact(4).zip(white.chunks_exact(4)) {
            let alpha = 255u8.saturating_sub(w[0].saturating_sub(b[0]));
            for channel in [2, 1, 0] {
                rgba.push(if alpha == 0 {
                    0
                } else {
                    ((b[channel] as u32 * 255) / alpha as u32).min(255) as u8
                });
            }
            rgba.push(alpha);
        }
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 64, 64);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder.write_header().ok()?.write_image_data(&rgba).ok()?;
        }
        Some(bytes)
    }
}

unsafe fn render(icon: Handle, background: u8) -> Option<Vec<u8>> {
    let dc = CreateCompatibleDC(ptr::null_mut());
    if dc.is_null() {
        return None;
    }
    let info = BitmapInfo {
        header: BitmapHeader {
            size: 40,
            width: 64,
            height: -64,
            planes: 1,
            bits: 32,
            compression: 0,
            image_size: 0,
            x: 0,
            y: 0,
            used: 0,
            important: 0,
        },
        colors: [0],
    };
    let mut bits = ptr::null_mut();
    let bitmap = CreateDIBSection(dc, &info, 0, &mut bits, ptr::null_mut(), 0);
    if bitmap.is_null() || bits.is_null() {
        if !bitmap.is_null() {
            DeleteObject(bitmap);
        }
        DeleteDC(dc);
        return None;
    }
    let old = SelectObject(dc, bitmap);
    let result = if old.is_null() || old as isize == -1 {
        None
    } else {
        ptr::write_bytes(bits, background, 64 * 64 * 4);
        let ok = DrawIconEx(dc, 0, 0, icon, 64, 64, 0, ptr::null_mut(), 3);
        GdiFlush();
        let result =
            (ok != 0).then(|| std::slice::from_raw_parts(bits as *const u8, 64 * 64 * 4).to_vec());
        SelectObject(dc, old);
        result
    };
    DeleteObject(bitmap);
    DeleteDC(dc);
    result
}
