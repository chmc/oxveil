import type { IInstaller } from "./interfaces";

const INSTALL_URL =
  "https://raw.githubusercontent.com/chmc/claudeloop/main/install.sh";

const SUPPORTED_PLATFORMS = new Set(["darwin", "linux"]);

export interface InstallerDeps {
  createTerminal: (options: { name: string }) => {
    sendText: (text: string) => void;
    show: () => void;
  };
  onDidCloseTerminal: (
    callback: (terminal: unknown) => void,
  ) => { dispose: () => void };
  onDetectionChanged: () => void;
  platform: string;
}

export class Installer implements IInstaller {
  private _deps: InstallerDeps;

  constructor(deps: InstallerDeps) {
    this._deps = deps;
  }

  isSupported(): boolean {
    return SUPPORTED_PLATFORMS.has(this._deps.platform);
  }

  async install(): Promise<void> {
    const terminal = this._deps.createTerminal({ name: "Install claudeloop" });
    terminal.show();
    terminal.sendText(`curl -fsSL ${INSTALL_URL} | bash`);

    return new Promise<void>((resolve) => {
      const disposable = this._deps.onDidCloseTerminal((closed) => {
        if (closed !== terminal) return;
        disposable.dispose();
        this._deps.onDetectionChanged();
        resolve();
      });
    });
  }
}
