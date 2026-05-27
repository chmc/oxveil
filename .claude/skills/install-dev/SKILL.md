---
name: install-dev
description: Package and install the current Oxveil build into VS Code. Use when the user says "install", "deploy locally", or after completing work that should be tested in the real extension host.
---

# Install Oxveil to VS Code

## Steps

1. Run `npm run build` to compile TypeScript.
2. Run `npm run package` to build the VSIX.
3. Run `code --install-extension oxveil.vsix --force` to install it.
4. Verify installation: `code --list-extensions --show-versions | grep -i oxveil`
5. Tell the user to reload VS Code (`Cmd+Shift+P` -> "Developer: Reload Window").
