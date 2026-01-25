import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

let mcpProcess: any;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
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

function startServer(context: vscode.ExtensionContext) {
    if (mcpProcess) return;

    const config = vscode.workspace.getConfiguration('webmcp');
    const port = config.get('port', 3000);

    // Path to bundled executable (placeholder)
    const exePath = context.asAbsolutePath(path.join('bin', process.platform === 'win32' ? 'webagent-mcp.exe' : 'webagent-mcp'));

    // For development: fallback to node script
    const scriptPath = context.asAbsolutePath(path.join('..', 'webagent-mcp', 'bin', 'webagent-mcp.js'));

    try {
        // Try spawning script for dev environment
        mcpProcess = spawn('node', [scriptPath, '--sse', '--port', port.toString()], {
            cwd: path.join(context.extensionPath, '..', 'webagent-mcp')
        });

        mcpProcess.stdout.on('data', (data: any) => {
            console.log(`WebMCP: ${data}`);
        });

        mcpProcess.stderr.on('data', (data: any) => {
            console.error(`WebMCP Error: ${data}`);
        });

        mcpProcess.on('close', (code: any) => {
            console.log(`WebMCP process exited with code ${code}`);
            mcpProcess = null;
            updateStatusBar(false);
        });

        updateStatusBar(true);
        vscode.window.showInformationMessage(`WebMCP Server started on port ${port}`);

    } catch (error: any) {
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

function updateStatusBar(active: boolean) {
    if (active) {
        statusBarItem.text = '$(globe) WebMCP Connected';
        statusBarItem.backgroundColor = undefined;
        statusBarItem.show();
    } else {
        statusBarItem.text = '$(circle-slash) WebMCP Stopped';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        statusBarItem.show();
    }
}

export function deactivate() {
    stopServer();
}
