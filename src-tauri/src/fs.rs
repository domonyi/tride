use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub fn list_dir(dir: &str) -> Result<Vec<FileEntry>, String> {
    let path = Path::new(dir);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir));
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(path).map_err(|e| format!("Failed to read dir: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Entry error: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/dirs and common noise
        if name.starts_with('.') || name == "node_modules" || name == "target" || name == "__pycache__" {
            continue;
        }

        let file_type = entry.file_type().map_err(|e| format!("Type error: {}", e))?;
        entries.push(FileEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: file_type.is_dir(),
        });
    }

    // Dirs first, then files, alphabetical within each
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

pub fn read_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))
}

pub fn read_file_base64(path: &str) -> Result<String, String> {
    use base64::Engine;
    let bytes = fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))
}

pub fn append_file(path: &str, content: &str) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Failed to open file for append: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to append to file: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DtsFile {
    pub uri: String,
    pub content: String,
}

/// Recursively read all .d.ts files from a directory, returning (uri, content) pairs.
/// The uri is formatted as file:///node_modules/... for Monaco.
pub fn read_dts_files(base_dir: &str, package_name: &str) -> Result<Vec<DtsFile>, String> {
    let pkg_dir = Path::new(base_dir)
        .join("node_modules")
        .join(package_name);

    if !pkg_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    collect_dts(&pkg_dir, &pkg_dir, package_name, &mut results)?;
    Ok(results)
}

/// Scan node_modules for ALL packages that ship .d.ts files (not just @types).
/// This catches packages like @iconkit/core that bundle their own types.
pub fn read_all_node_types(base_dir: &str) -> Result<Vec<DtsFile>, String> {
    let nm = Path::new(base_dir).join("node_modules");
    if !nm.is_dir() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    scan_node_modules_dir(&nm, &nm, &mut results)?;
    Ok(results)
}

fn scan_node_modules_dir(nm_root: &Path, dir: &Path, results: &mut Vec<DtsFile>) -> Result<(), String> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if !path.is_dir() || name == ".cache" || name == ".bin" || name == ".package-lock.json" {
            continue;
        }

        // Scoped packages like @iconkit/core
        if name.starts_with('@') {
            scan_node_modules_dir(nm_root, &path, results)?;
            continue;
        }

        // Check if this package ships type definitions
        let has_types = has_types_field(&path)
            || path.join("index.d.ts").exists()
            || has_any_dts_shallow(&path);

        if has_types {
            let pkg_name = path.strip_prefix(nm_root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            collect_dts(&path, &path, &pkg_name, results)?;
        }
    }
    Ok(())
}

fn has_types_field(pkg_dir: &Path) -> bool {
    let pkg_json = pkg_dir.join("package.json");
    if let Ok(content) = fs::read_to_string(&pkg_json) {
        content.contains("\"types\"") || content.contains("\"typings\"")
    } else {
        false
    }
}

/// Check if a package dir or its immediate subdirs contain any .d.ts or .ts file
fn has_any_dts_shallow(pkg_dir: &Path) -> bool {
    let dirs_to_check = [
        pkg_dir.to_path_buf(),
        pkg_dir.join("dist"),
        pkg_dir.join("lib"),
        pkg_dir.join("src"),
        pkg_dir.join("types"),
        pkg_dir.join("build"),
    ];
    for dir in &dirs_to_check {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".d.ts") || name.ends_with(".d.mts") || name.ends_with(".ts") || name.ends_with(".tsx") {
                    return true;
                }
            }
        }
    }
    false
}

/// Recursively read all TypeScript/JavaScript source files from a project.
/// Scans all directories (skipping node_modules, dist, etc.) to support monorepos.
pub fn read_project_sources(base_dir: &str) -> Result<Vec<DtsFile>, String> {
    let base = Path::new(base_dir);
    let mut results = Vec::new();

    // Scan all top-level directories (handles monorepos with packages/, apps/, src/, etc.)
    if let Ok(entries) = fs::read_dir(base) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if path.is_dir() {
                // Skip noise directories
                if name == "node_modules" || name == "dist" || name == "build"
                    || name == ".next" || name == "target" || name == ".git"
                    || name == ".turbo" || name == "coverage" || name == "svg"
                    || name.starts_with('.')
                {
                    continue;
                }
                collect_sources(&base, &path, &mut results)?;
            }
        }
    }

    // Also pick up root-level config/type files
    if let Ok(entries) = fs::read_dir(base) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if is_ts_source(name) {
                        if let Ok(content) = fs::read_to_string(&path) {
                            let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                            results.push(DtsFile {
                                uri: format!("file:///{}", rel),
                                content,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(results)
}

fn is_ts_source(name: &str) -> bool {
    name.ends_with(".ts")
        || name.ends_with(".tsx")
        || name.ends_with(".d.ts")
        || name.ends_with(".js")
        || name.ends_with(".jsx")
}

fn collect_sources(base: &Path, dir: &Path, results: &mut Vec<DtsFile>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Read dir error: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name == "node_modules" || name == "dist" || name == "build" || name == ".next" || name == "target" || name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            collect_sources(base, &path, results)?;
        } else if is_ts_source(&name) {
            if let Ok(content) = fs::read_to_string(&path) {
                let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                results.push(DtsFile {
                    uri: format!("file:///{}", rel),
                    content,
                });
            }
        }
    }
    Ok(())
}

/// Recursively walk a directory and return all file paths (relative to root).
/// Respects common ignore patterns (node_modules, .git, dist, etc.)
/// Returns at most `limit` results to avoid overwhelming the frontend.
pub fn walk_files(root: &str, limit: usize) -> Result<Vec<String>, String> {
    let base = Path::new(root);
    if !base.is_dir() {
        return Err(format!("Not a directory: {}", root));
    }
    let mut results = Vec::new();
    walk_files_recursive(base, base, limit, &mut results)?;
    Ok(results)
}

fn walk_files_recursive(
    base: &Path,
    dir: &Path,
    limit: usize,
    results: &mut Vec<String>,
) -> Result<(), String> {
    if results.len() >= limit {
        return Ok(());
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        if results.len() >= limit {
            return Ok(());
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden dirs and common noise
        if name.starts_with('.')
            || name == "node_modules"
            || name == "target"
            || name == "__pycache__"
            || name == "dist"
            || name == "build"
            || name == ".next"
            || name == "coverage"
            || name == ".turbo"
        {
            continue;
        }

        if path.is_dir() {
            walk_files_recursive(base, &path, limit, results)?;
        } else {
            let rel = path
                .strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            results.push(rel);
        }
    }
    Ok(())
}

/// Delete a file or directory (recursively)
pub fn delete_entry(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        fs::remove_file(p).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

/// Rename / move a file or directory
pub fn rename_entry(old_path: &str, new_path: &str) -> Result<(), String> {
    fs::rename(old_path, new_path).map_err(|e| format!("Failed to rename: {}", e))
}

/// Create a new empty file (creating parent dirs if needed)
pub fn create_file(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dirs: {}", e))?;
    }
    fs::write(p, "").map_err(|e| format!("Failed to create file: {}", e))
}

/// Create a new directory (creating parent dirs if needed)
pub fn create_dir(path: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("Failed to create directory: {}", e))
}

fn collect_dts(
    root: &Path,
    dir: &Path,
    package_name: &str,
    results: &mut Vec<DtsFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Read dir error: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Entry error: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name == "node_modules" {
            continue;
        }

        if path.is_dir() {
            collect_dts(root, &path, package_name, results)?;
        } else if name.ends_with(".d.ts") || name.ends_with(".d.mts") || name.ends_with(".ts") || name.ends_with(".tsx") || name == "package.json" {
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            let uri = format!("file:///node_modules/{}/{}", package_name, rel);

            match fs::read_to_string(&path) {
                Ok(content) => {
                    results.push(DtsFile { uri, content });
                }
                Err(_) => {} // skip unreadable files
            }
        }
    }
    Ok(())
}
