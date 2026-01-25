/**
 * Webagent MCP Setup
 * 
 * Auto-configures Claude Desktop and other MCP clients.
 * Registers native messaging host for Chrome extension communication.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runSetup() {
    console.log('');
    console.log('🚀 Webagent MCP Setup');
    console.log('='.repeat(40));
    console.log('');

    // Step 1: Check for Claude Desktop
    const claudeConfigured = await setupClaudeDesktop();

    // Step 2: Register native messaging host
    const nativeHostRegistered = await registerNativeHost();

    // Summary
    console.log('');
    console.log('='.repeat(40));
    console.log('Setup Summary:');
    console.log(`  Claude Desktop: ${claudeConfigured ? '✅ Configured' : '⚠️  Not found'}`);
    console.log(`  Native Host:    ${nativeHostRegistered ? '✅ Registered' : '⚠️  Skipped'}`);
    console.log('');

    if (claudeConfigured) {
        console.log('✨ Restart Claude Desktop to start using Webagent!');
        console.log('');
        console.log('Try saying: "Navigate to google.com and search for cats"');
    } else {
        console.log('To use with other MCP clients, add this to your config:');
        console.log('');
        console.log('  {');
        console.log('    "mcpServers": {');
        console.log('      "webagent": { "command": "webagent-mcp" }');
        console.log('    }');
        console.log('  }');
    }
    console.log('');
}

async function setupClaudeDesktop() {
    const configPath = getClaudeConfigPath();

    if (!configPath) {
        console.log('⚠️  Claude Desktop config path not found for this platform');
        return false;
    }

    console.log(`📁 Claude config: ${configPath}`);

    try {
        let config = {};

        if (existsSync(configPath)) {
            const content = readFileSync(configPath, 'utf8');
            config = JSON.parse(content);
            console.log('   Found existing config');
        } else {
            // Create directory if needed
            const configDir = dirname(configPath);
            if (!existsSync(configDir)) {
                mkdirSync(configDir, { recursive: true });
            }
            console.log('   Creating new config');
        }

        // Add webagent to mcpServers
        config.mcpServers = config.mcpServers || {};

        if (config.mcpServers.webagent) {
            console.log('   Webagent already configured, updating...');
        }

        config.mcpServers.webagent = {
            command: 'webagent-mcp',
            args: []
        };

        // Write config
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('   ✅ Added webagent to Claude Desktop');

        return true;
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return false;
    }
}

async function registerNativeHost() {
    // Native host registration is platform-specific
    // For now, just log instructions

    console.log('');
    console.log('📦 Native Messaging Host');
    console.log('   (Required for Chrome extension communication)');

    const plat = platform();

    if (plat === 'win32') {
        console.log('   Windows: Registry entry needed');
        console.log('   Run as admin: webagent-mcp register-native-host');
    } else if (plat === 'darwin') {
        console.log('   macOS: Installing to ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/');
    } else {
        console.log('   Linux: Installing to ~/.config/google-chrome/NativeMessagingHosts/');
    }

    // TODO: Actually create the native messaging host manifest
    console.log('   ⚠️  Native host registration not yet implemented');
    console.log('   (Extension will work in mock mode for testing)');

    return false;
}

function getClaudeConfigPath() {
    const plat = platform();

    if (plat === 'darwin') {
        return join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
    } else if (plat === 'win32') {
        return join(process.env.APPDATA || '', 'Claude/claude_desktop_config.json');
    } else if (plat === 'linux') {
        return join(homedir(), '.config/claude/claude_desktop_config.json');
    }

    return null;
}
