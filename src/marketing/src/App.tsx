function App() {
  return (
    <div className="min-h-screen font-mono text-[13px] leading-relaxed">
      {/* Nav */}
      <nav className="animate-fade-in sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2 text-text-bright tracking-tight">
            <span className="text-accent font-bold text-base">&#9650;</span>
            <span className="font-bold text-base">tride</span>
          </a>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/nickolay-github/tride"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-text hover:text-text-bright transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 md:pt-32 md:pb-24">
        <h1 className="animate-fade-up delay-100 font-serif text-5xl md:text-7xl lg:text-8xl font-medium text-text-bright leading-[0.95] tracking-tight mb-8">
          One window.<br />
          <span className="italic text-accent">Every workflow.</span>
        </h1>

        <p className="animate-fade-up delay-300 max-w-xl text-sm md:text-base text-text leading-relaxed mb-10">
          Tride is an AI-native command center for developers.
          Manage projects, orchestrate parallel AI agents, review diffs,
          and ship code — without leaving a single window.
        </p>

        <div className="animate-fade-up delay-400 flex flex-wrap gap-3">
          <a
            href="https://github.com/nickolay-github/tride"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-accent text-bg font-medium text-sm px-5 py-2.5 hover:bg-accent/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            View on GitHub
          </a>
          <a
            href="https://github.com/nickolay-github/tride#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-border-bright text-text-bright text-sm px-5 py-2.5 hover:border-text hover:bg-surface-2 transition-colors"
          >
            Read the docs
          </a>
        </div>
      </section>

      {/* Terminal Mockup */}
      <section className="mx-auto max-w-5xl px-6 pb-24 md:pb-32">
        <div className="animate-fade-up delay-500 border border-border-bright rounded-lg overflow-hidden bg-surface shadow-[0_0_80px_-20px_rgba(34,211,238,0.08)]">
          {/* Window Chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            </div>
            <span className="ml-2 text-[11px] text-text/60 tracking-wider uppercase">tride — command center</span>
          </div>

          {/* App Content */}
          <div className="flex min-h-[340px] md:min-h-[400px] text-[12px] leading-[1.6]">
            {/* Sidebar */}
            <div className="w-44 shrink-0 border-r border-border p-3 hidden md:block">
              <div className="text-[10px] uppercase tracking-[0.15em] text-text/50 mb-3">Projects</div>
              <div className="space-y-1">
                <div className="text-accent">&#9656; api-server</div>
                <div className="pl-3 text-text/50">
                  <div>main</div>
                  <div className="text-[#28c840]">wt/auth <span className="text-text/30">&#8226; agent</span></div>
                  <div className="text-text/40">wt/tests</div>
                </div>
                <div className="text-text-bright mt-2">&#9656; web-app</div>
                <div className="pl-3 text-text/50">
                  <div>main</div>
                </div>
                <div className="text-text/50 mt-2">&#9656; docs-site</div>
                <div className="pl-3 text-text/30">
                  <div>main</div>
                </div>
              </div>
            </div>

            {/* Main Panel */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Agent Output */}
              <div className="flex-1 p-4 space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-accent font-medium">agent:refactor-auth</span>
                  <span className="text-text/30">|</span>
                  <span className="text-text/50">wt/auth</span>
                  <span className="text-text/30 ml-auto">73%</span>
                </div>
                <div className="w-full h-1 bg-border rounded-full overflow-hidden mb-4">
                  <div className="animate-progress h-full bg-accent/70 rounded-full" />
                </div>
                <div className="space-y-1.5 text-text/70">
                  <div><span className="text-text/30">$</span> Analyzing auth middleware...</div>
                  <div><span className="text-[#28c840]">&#10003;</span> Identified 3 deprecated patterns</div>
                  <div><span className="text-[#28c840]">&#10003;</span> Generated replacement code</div>
                  <div><span className="text-[#28c840]">&#10003;</span> Updated session token handling</div>
                  <div>
                    <span className="text-accent">&#9673;</span> Running test suite...
                    <span className="animate-cursor inline-block w-[6px] h-[13px] bg-accent/70 ml-1 translate-y-[2px]" />
                  </div>
                </div>
              </div>

              {/* Git Status Bar */}
              <div className="border-t border-border p-3 bg-surface-2/50">
                <div className="text-[10px] uppercase tracking-[0.15em] text-text/40 mb-2">Git Status — wt/auth</div>
                <div className="space-y-0.5 text-text/60">
                  <div><span className="text-accent">M</span> src/auth/middleware.ts</div>
                  <div><span className="text-accent">M</span> src/auth/session.ts</div>
                  <div><span className="text-[#28c840]">A</span> src/auth/validators.ts</div>
                </div>
                <div className="mt-2 text-text/30 text-right">
                  <span className="text-[#28c840]">+147</span> <span className="text-[#ff6b6b]">-52</span> lines
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-24 md:pb-32">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              title: "Parallel AI Agents",
              desc: "Run multiple AI sessions across git worktrees. Each agent works in isolation — no conflicts, no waiting.",
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                </svg>
              ),
            },
            {
              title: "Visual Git Ops",
              desc: "Stage, diff, commit, and push with a visual interface. See what changed across every worktree at a glance.",
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
              ),
            },
            {
              title: "Multi-Project Dashboard",
              desc: "All your repos, agents, and branches in one view. Context switching is a scroll, not a window hunt.",
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zm0 9.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zm9.75-9.75A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zm0 9.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
                </svg>
              ),
            },
          ].map((feature, i) => (
            <div
              key={feature.title}
              className={`animate-fade-up delay-${(i + 6) * 100} group border border-border hover:border-border-bright p-6 transition-all duration-300 hover:bg-surface-2/50`}
            >
              <div className="text-accent mb-4 opacity-60 group-hover:opacity-100 transition-opacity">
                {feature.icon}
              </div>
              <h3 className="text-text-bright font-medium text-sm mb-2">{feature.title}</h3>
              <p className="text-text/70 text-[12px] leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 pb-24 md:pb-32">
        <div className="border border-border p-10 md:p-16 text-center bg-gradient-to-b from-surface-2/50 to-transparent">
          <p className="text-[11px] uppercase tracking-[0.2em] text-accent/70 mb-4">Get Started</p>
          <h2 className="font-serif text-3xl md:text-4xl text-text-bright font-medium mb-4">
            Stop juggling windows.
          </h2>
          <p className="text-text text-sm mb-8 max-w-md mx-auto">
            Tride is free, open source, and built for the way developers actually work today.
          </p>
          <div className="inline-flex items-center gap-3 bg-surface-2 border border-border-bright px-4 py-2.5 text-sm">
            <span className="text-text/50">$</span>
            <code className="text-text-bright">git clone https://github.com/nickolay-github/tride.git</code>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-text/50">
          <div className="flex items-center gap-2">
            <span className="text-accent text-sm">&#9650;</span>
            <span>tride</span>
            <span className="text-text/20">|</span>
            <span>Built with Tauri + React</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/nickolay-github/tride"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://github.com/nickolay-github/tride/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text transition-colors"
            >
              MIT License
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
