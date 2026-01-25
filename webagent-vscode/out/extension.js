"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const child_process_1 = require("child_process");
const path = require("path");
let mcpProcess;
let statusBarItem;
function activate(context) {
    console.log('WebMCP extension is now active!');
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'webmcp.stop';
    context.subscriptions.push(statusBarItem);
    // Register commands
    let startDisposable = vscode.commands.registerCommand('webmcp.start', () => {
        startServer(context);
    });
    let stopDisposable = vscode.commands.registerCommand('webmcp.stop', () => {
        stopServer();
    });
    context.subscriptions.push(startDisposable);
    context.subscriptions.push(stopDisposable);
    // Auto-start
    startServer(context);
}
function startServer(context) {
    if (mcpProcess)
        return;
    const config = vscode.workspace.getConfiguration('webmcp');
    const port = config.get('port', 3000);
    // Path to bundled executable (placeholder)
    const exePath = context.asAbsolutePath(path.join('bin', process.platform === 'win32' ? 'webagent-mcp.exe' : 'webagent-mcp'));
    // For development: fallback to node script
    const scriptPath = context.asAbsolutePath(path.join('..', 'webagent-mcp', 'bin', 'webagent-mcp.js'));
    try {
        // Try spawning script for dev environment
        mcpProcess = (0, child_process_1.spawn)('node', [scriptPath, '--sse', '--port', port.toString()], {
            cwd: path.join(context.extensionPath, '..', 'webagent-mcp')
        });
        mcpProcess.stdout.on('data', (data) => {
            console.log(`WebMCP: ${data}`);
        });
        mcpProcess.stderr.on('data', (data) => {
            console.error(`WebMCP Error: ${data}`);
        });
        mcpProcess.on('close', (code) => {
            console.log(`WebMCP process exited with code ${code}`);
            mcpProcess = null;
            updateStatusBar(false);
        });
        updateStatusBar(true);
        vscode.window.showInformationMessage(`WebMCP Server started on port ${port}`);
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to start WebMCP: ${error.message}`);
    }
}
function stopServer() {
    if (mcpProcess) {
        mcpProcess.kill();
        mcpProcess = null;
        updateStatusBar(false);
        vscode.window.showInformationMessage('WebMCP Server stopped');
    }
}
function updateStatusBar(active) {
    if (active) {
        statusBarItem.text = '$(globe) WebMCP Connected';
        statusBarItem.backgroundColor = undefined;
        statusBarItem.show();
    }
    else {
        statusBarItem.text = '$(circle-slash) WebMCP Stopped';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        statusBarItem.show();
    }
}
function deactivate() {
    stopServer();
}
//# sourceMappingURL=extension.js.map