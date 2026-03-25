use serde::{Deserialize, Serialize};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,   // "M", "A", "D", "?", "R", etc.
    pub staged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub refs: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranchInfo {
    pub name: String,
    pub current: bool,
    pub remote: bool,
}

fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(cwd);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Some git commands write to stderr even on success (e.g. status)
        if output.stdout.is_empty() && !stderr.is_empty() {
            return Err(format!("git error: {}", stderr.trim()));
        }
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Get the list of changed files (staged + unstaged + untracked)
pub fn status(cwd: &str) -> Result<Vec<GitFileStatus>, String> {
    let output = run_git(cwd, &["status", "--porcelain=v1", "-uall"])?;
    let mut files = Vec::new();

    for line in output.lines() {
        if line.len() < 4 {
            continue;
        }
        let index_status = line.chars().nth(0).unwrap_or(' ');
        let work_status = line.chars().nth(1).unwrap_or(' ');
        let path = line[3..].to_string();

        // Determine the display status and staged state
        if index_status != ' ' && index_status != '?' {
            files.push(GitFileStatus {
                path: path.clone(),
                status: index_status.to_string(),
                staged: true,
            });
        }
        if work_status != ' ' && work_status != '?' {
            files.push(GitFileStatus {
                path: path.clone(),
                status: work_status.to_string(),
                staged: false,
            });
        }
        if index_status == '?' {
            files.push(GitFileStatus {
                path,
                status: "?".to_string(),
                staged: false,
            });
        }
    }

    Ok(files)
}

/// Get unified diff for a specific file, or all changes if path is empty
pub fn diff(cwd: &str, file_path: &str, staged: bool) -> Result<String, String> {
    let mut args = vec!["diff", "--no-color"];
    if staged {
        args.push("--cached");
    }
    if !file_path.is_empty() {
        args.push("--");
        args.push(file_path);
    }
    run_git(cwd, &args)
}

/// Get the full file content at HEAD (for diff comparison)
pub fn show_head(cwd: &str, file_path: &str) -> Result<String, String> {
    let spec = format!("HEAD:{}", file_path.replace('\\', "/"));
    run_git(cwd, &["show", &spec])
}

/// Get commit log
pub fn log(cwd: &str, count: u32) -> Result<Vec<GitCommitInfo>, String> {
    let count_str = format!("-{}", count);
    let output = run_git(
        cwd,
        &[
            "log",
            &count_str,
            "--format=%H%n%h%n%s%n%an%n%ar%n%D",
            "--no-color",
        ],
    )?;

    let mut commits = Vec::new();
    let lines: Vec<&str> = output.lines().collect();
    let mut i = 0;

    while i + 5 < lines.len() {
        commits.push(GitCommitInfo {
            hash: lines[i].to_string(),
            short_hash: lines[i + 1].to_string(),
            message: lines[i + 2].to_string(),
            author: lines[i + 3].to_string(),
            date: lines[i + 4].to_string(),
            refs: lines[i + 5].to_string(),
        });
        i += 6;
    }

    Ok(commits)
}

/// List branches
pub fn branches(cwd: &str) -> Result<Vec<GitBranchInfo>, String> {
    let output = run_git(cwd, &["branch", "-a", "--no-color"])?;
    let mut branches = Vec::new();

    for line in output.lines() {
        let current = line.starts_with('*');
        let name = line.trim_start_matches('*').trim().to_string();
        let remote = name.starts_with("remotes/");
        branches.push(GitBranchInfo {
            name,
            current,
            remote,
        });
    }

    Ok(branches)
}

/// Get current branch name
pub fn current_branch(cwd: &str) -> Result<String, String> {
    let output = run_git(cwd, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok(output.trim().to_string())
}

/// Stage a file (or all with ".")
pub fn stage(cwd: &str, path: &str) -> Result<(), String> {
    run_git(cwd, &["add", path])?;
    Ok(())
}

/// Unstage a file
pub fn unstage(cwd: &str, path: &str) -> Result<(), String> {
    run_git(cwd, &["reset", "HEAD", "--", path])?;
    Ok(())
}

/// Commit with message
pub fn commit(cwd: &str, message: &str) -> Result<String, String> {
    let output = run_git(cwd, &["commit", "-m", message])?;
    Ok(output.trim().to_string())
}

/// Push current branch
pub fn push(cwd: &str) -> Result<String, String> {
    let branch = current_branch(cwd)?;
    let output = run_git(cwd, &["push", "origin", &branch])?;
    Ok(output.trim().to_string())
}

/// Get files changed in a specific commit
pub fn commit_files(cwd: &str, hash: &str) -> Result<Vec<GitFileStatus>, String> {
    let output = run_git(cwd, &["diff-tree", "--no-commit-id", "-r", "--name-status", hash])?;
    let mut files = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(2, '\t').collect();
        if parts.len() == 2 {
            files.push(GitFileStatus {
                status: parts[0].to_string(),
                path: parts[1].to_string(),
                staged: true,
            });
        }
    }
    Ok(files)
}

/// Get file content at a specific commit
pub fn show_file_at(cwd: &str, hash: &str, file_path: &str) -> Result<String, String> {
    let spec = format!("{}:{}", hash, file_path.replace('\\', "/"));
    run_git(cwd, &["show", &spec])
}

/// Get file content at the parent of a specific commit
pub fn show_file_at_parent(cwd: &str, hash: &str, file_path: &str) -> Result<String, String> {
    let spec = format!("{}~1:{}", hash, file_path.replace('\\', "/"));
    run_git(cwd, &["show", &spec])
}

/// Switch to a branch
pub fn checkout_branch(cwd: &str, branch: &str) -> Result<String, String> {
    let output = run_git(cwd, &["checkout", branch])?;
    Ok(output.trim().to_string())
}

/// Create and switch to a new branch
pub fn create_branch(cwd: &str, branch: &str) -> Result<String, String> {
    let output = run_git(cwd, &["checkout", "-b", branch])?;
    Ok(output.trim().to_string())
}

/// Delete a branch
pub fn delete_branch(cwd: &str, branch: &str) -> Result<String, String> {
    let output = run_git(cwd, &["branch", "-d", branch])?;
    Ok(output.trim().to_string())
}
