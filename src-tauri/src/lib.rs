use std::fs;
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
// Windows 下 spawn 控制台程序（node.exe）默认会弹黑窗，需 CREATE_NO_WINDOW 抑制。
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent};

/// 后端子进程句柄，退出时取出 kill。
struct ServerChild(Mutex<Option<Child>>);

const BACKEND_PORT: u16 = 4123;

/// 轮询后端端口直到可连接（或超时）。
fn wait_for_backend(timeout: Duration) -> bool {
    let addr = format!("127.0.0.1:{}", BACKEND_PORT);
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(&addr).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(120));
    }
    false
}

#[cfg(unix)]
fn ensure_executable(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o755));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let resource_dir = app.path().resource_dir()?;
            // Windows 下 Tauri 返回 `\\?\D:\...` verbatim 路径；node 无法以 verbatim 路径
            // 作为入口脚本（realpathSync 报 EISDIR: lstat 'D:'），需去掉前缀转成普通 DOS 路径。
            let resource_dir = dunce::simplified(&resource_dir).to_path_buf();
            // Tauri 保留 bundle.resources 的相对路径前缀，资源落在 <resource_dir>/resources/
            let resources_base = resource_dir.join("resources");
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;

            let node_bin = resources_base.join(if cfg!(windows) { "node.exe" } else { "node" });
            let server_js = resources_base.join("server").join("index.js");
            let server_cwd = resources_base.join("server");
            let db_template = resources_base.join("app.db.template");
            let db_path = data_dir.join("app.db");
            let config_path = data_dir.join("config.json");
            let log_path = data_dir.join("server.log");

            if !node_bin.exists() {
                log::error!(
                    "找不到随包 node 二进制：{}",
                    node_bin.display()
                );
            }

            // 首次运行：从模板创建空库（带表结构、无数据）
            if !db_path.exists() && db_template.exists() {
                fs::copy(&db_template, &db_path)?;
            }

            // 保险：确保 node 二进制可执行（资源拷贝有时丢权限）
            #[cfg(unix)]
            ensure_executable(&node_bin);

            // 后端 stdout/stderr 落 app_data_dir/server.log 便于排查
            let mut log_file = fs::File::create(&log_path)?;
            // 写一行启动诊断到日志头部，便于排查后端启动失败
            {
                use std::io::Write;
                let _ = writeln!(
                    log_file,
                    "[tauri] node={} server_js={} cwd={}",
                    node_bin.display(),
                    server_js.display(),
                    server_cwd.display()
                );
                let _ = writeln!(log_file, "[tauri] DATABASE_URL=file:{}", db_path.display());
                let _ = log_file.flush();
            }
            let stderr = log_file.try_clone()?;

            let mut cmd = Command::new(&node_bin);
            cmd.arg(&server_js)
                .current_dir(&server_cwd)
                .env("NODE_ENV", "production")
                .env("BROWSER_MODE", "system")
                .env("PORT", BACKEND_PORT.to_string())
                .env("DATABASE_URL", format!("file:{}", db_path.display()))
                .env("CONFIG_PATH", &config_path)
                .stdout(Stdio::from(log_file))
                .stderr(Stdio::from(stderr));
            // CREATE_NO_WINDOW (0x08000000)：不在前台弹出 node 命令行控制台窗口。
            #[cfg(windows)]
            cmd.creation_flags(0x08000000);
            let child = cmd.spawn()?;

            app.manage(ServerChild(Mutex::new(Some(child))));

            // 阻塞到后端端口就绪再继续；窗口随后创建，避免首屏 fetch 失败
            if !wait_for_backend(Duration::from_secs(20)) {
                log::error!(
                    "后端未在 20s 内就绪，请查看日志：{}",
                    log_path.display()
                );
            } else {
                log::info!("后端已就绪 :{}", BACKEND_PORT);
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 应用退出时终止后端子进程
            if let RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ServerChild>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
