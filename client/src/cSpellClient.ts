import {
    LanguageClient, LanguageClientOptions, ServerOptions, TransportKind
} from 'vscode-languageclient';

import * as vscode from 'vscode';

import { CSpellUserSettings } from './CSpellSettings';
import * as Settings from './settings';

import * as LanguageIds from './languageIds';
import { unique, Maybe } from './util';

// The debug options for the server
const debugOptions = { execArgv: ['--nolazy', '--debug=60048'] };

export interface ServerResponseIsSpellCheckEnabled {
    languageEnabled?: boolean;
    fileEnabled?: boolean;
}

export class CSpellClient {

    readonly client: LanguageClient;

    /**
     * @param: {string} module -- absolute path to the server module.
     */
    constructor(module: string, languageIds: string[]) {
        const enabledLanguageIds = Settings.getSettingFromConfig('enabledLanguageIds');
        const schema = 'file';
        const documentSelector =
            unique(languageIds
                .concat(enabledLanguageIds || [])
                .concat(LanguageIds.languageIds)
            )
            .map(language => ({ language, schema }))
            .concat([{ language: 'plaintext', schema: 'untitled' }]);
        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            documentSelector,
            diagnosticCollectionName: 'cSpell Checker',
            synchronize: {
                // Synchronize the setting section 'spellChecker' to the server
                configurationSection: ['cSpell', 'search']
            }
        };

        // If the extension is launched in debug mode the debug server options are use
        // Otherwise the run options are used
        const serverOptions: ServerOptions = {
            run : { module, transport: TransportKind.ipc },
            debug: { module, transport: TransportKind.ipc, options: debugOptions }
        };

        // Create the language client and start the client.
        this.client = new LanguageClient('Code Spell Checker', serverOptions, clientOptions);
    }

    public needsStart() {
        return this.client.needsStart();
    }

    public needsStop() {
        return this.client.needsStop();
    }

    public start() {
        return this.client.start();
    }

    public isSpellCheckEnabled(document: vscode.TextDocument): Thenable<ServerResponseIsSpellCheckEnabled> {
        const { uri, languageId = '' } = document;

        if (!uri || !languageId) {
            return Promise.resolve({});
        }

        return this.client.onReady().then(() => this.client.sendRequest(
            'isSpellCheckEnabled',
            { uri: uri.toString(), languageId }
        ))
        .then((response: ServerResponseIsSpellCheckEnabled) => response);
    }

    public applySettings(settings: { cSpell: CSpellUserSettings, search: any }) {
        return this.client.onReady().then(() => this.client.sendNotification('applySettings', { settings }));
    }

    get diagnostics(): Maybe<vscode.DiagnosticCollection> {
        return (this.client && this.client.diagnostics) || undefined;
    }

    public triggerSettingsRefresh() {
        const workspaceConfig = vscode.workspace.getConfiguration();
        const cSpell = workspaceConfig.get('cSpell') as CSpellUserSettings;
        const search = workspaceConfig.get('search');
        this.applySettings({ cSpell, search });
    }

    public static create(module: string) {
        return vscode.languages.getLanguages().then(langIds => new CSpellClient(module, langIds));
    }
}
