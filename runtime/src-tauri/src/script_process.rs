//! Own the entire script process tree, including background descendants.
use std::process::{Child, Command};
#[cfg(target_os = "macos")]
pub struct Tree(u32);
#[cfg(target_os = "macos")]
static ACTIVE: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(Vec::new());
#[cfg(target_os = "macos")]
pub fn shutdown() {
    if let Ok(active) = ACTIVE.lock() {
        unsafe extern "C" {
            fn kill(pid: i32, signal: i32) -> i32;
        }
        for id in active.iter() {
            unsafe {
                kill(-(*id as i32), 9);
            }
        }
    }
}
#[cfg(target_os = "windows")]
pub fn shutdown() {} // KILL_ON_JOB_CLOSE also covers process exit.

#[cfg(target_os = "macos")]
pub fn prepare(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}
#[cfg(target_os = "macos")]
impl Tree {
    pub fn attach(child: &Child) -> Result<Self, String> {
        ACTIVE.lock().map_err(|e| e.to_string())?.push(child.id());
        Ok(Self(child.id()))
    }
    pub fn terminate(&self) -> Result<(), String> {
        unsafe extern "C" {
            fn kill(pid: i32, signal: i32) -> i32;
        }
        if unsafe { kill(-(self.0 as i32), 9) } == 0 {
            return Ok(());
        }
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(3) {
            Ok(())
        } else {
            Err(error.to_string())
        }
    }
}
#[cfg(target_os = "macos")]
impl Drop for Tree {
    fn drop(&mut self) {
        let _ = self.terminate();
        if let Ok(mut active) = ACTIVE.lock() {
            active.retain(|id| *id != self.0);
        }
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use std::{ffi::c_void, os::windows::io::AsRawHandle};
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
    };
    type Handle = *mut c_void;
    pub struct Tree(Handle);
    impl Tree {
        pub fn attach(child: &Child) -> Result<Self, String> {
            let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if job.is_null() {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let tree = Self(job);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if unsafe {
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const c_void,
                    std::mem::size_of_val(&limits) as u32,
                )
            } == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            if unsafe { AssignProcessToJobObject(job, child.as_raw_handle()) } == 0 {
                return Err(std::io::Error::last_os_error().to_string());
            }
            Ok(tree)
        }
        pub fn terminate(&self) -> Result<(), String> {
            if unsafe { TerminateJobObject(self.0, 1) } == 0 {
                Err(std::io::Error::last_os_error().to_string())
            } else {
                Ok(())
            }
        }
    }
    impl Drop for Tree {
        fn drop(&mut self) {
            let _ = self.terminate();
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}
#[cfg(target_os = "windows")]
pub use windows::Tree;
#[cfg(target_os = "windows")]
pub fn prepare(_: &mut Command) {}
