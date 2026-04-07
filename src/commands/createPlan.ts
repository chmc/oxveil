import * as vscode from "vscode";

export function registerCreatePlanCommand(): vscode.Disposable {
  return vscode.commands.registerCommand("oxveil.createPlan", () =>
    vscode.commands.executeCommand("oxveil.openPlanChat"),
  );
}
