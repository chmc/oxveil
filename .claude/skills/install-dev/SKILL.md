---
name: install-dev
description: Package and install the current Oxveil build into VS Code. Use when the user says "install", "deploy locally", or after completing work that should be tested in the real extension host.
---

# Install Oxveil to VS Code

## Steps

1. Run `npm run package` to build the VSIX.
2. Run `code --install-extension oxveil.vsix --force` to install it.
3. Tell the user to reload VS Code (`Cmd+Shift+P` -> "Developer: Reload Window").
