export interface OutputChannelDeps {
  appendLine(value: string): void;
  append(value: string): void;
  show(preserveFocus?: boolean): void;
  dispose(): void;
  clear(): void;
}

export class OutputChannelManager {
  private readonly _channel: OutputChannelDeps;

  constructor(channel: OutputChannelDeps) {
    this._channel = channel;
  }

  onLogAppended(content: string): void {
    const lines = content.split("\n");

    // Process each line, preserving trailing newlines for non-stderr
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip empty last element from trailing newline split
      if (i === lines.length - 1 && line === "") continue;

      if (line.startsWith("[stderr]")) {
        this._channel.appendLine(line);
      } else {
        this._channel.append(line + "\n");
      }
    }
  }

  show(preserveFocus = true): void {
    this._channel.show(preserveFocus);
  }

  clear(): void {
    this._channel.clear();
  }

  dispose(): void {
    this._channel.dispose();
  }
}
