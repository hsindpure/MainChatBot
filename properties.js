define([], function() {
    'use strict';

    // Property panel definition for QlikSense Extension
    var appearanceSection = {
        uses: "settings",
        items: {
            general: {
                items: {
                    showTitles: {
                        defaultValue: true
                    },
                    title: {
                        defaultValue: "AI Chatbot Assistant"
                    },
                    subtitle: {
                        defaultValue: "Powered by OpenAI"
                    }
                }
            }
        }
    };

    var chatbotSettings = {
        type: "items",
        label: "Chatbot Configuration",
        items: {
            apiSettings: {
                type: "items",
                label: "AI API Settings",
                items: {
				
                    objects: {
                        ref: "props.objects",
                        label: "Enter Object Ids",
                        type: "string",
                        expression: "optional"
                    },
                    apiEndpoint: {
                        ref: "props.apiEndpoint",
                        label: "API Endpoint URL",
                        type: "string",
                        defaultValue: "https://api.openai.com/v1/chat/completions",
                        show: true
                    },
                    apiKey: {
                        ref: "props.apiKey",
                        label: "API Key",
                        type: "string",
                        defaultValue: "",
                        show: true,
                        sensitive: true
                    },
                    model: {
                        ref: "props.model",
                        label: "AI Model",
                        type: "string",
                        component: "dropdown",
                        options: [
                            { value: "gpt-4", label: "GPT-4" },
                            { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
                            { value: "gpt-4-turbo", label: "GPT-4 Turbo" }
                        ],
                        defaultValue: "gpt-3.5-turbo"
                    },
                    maxTokens: {
                        ref: "props.maxTokens",
                        label: "Max Response Tokens",
                        type: "number",
                        defaultValue: 1500,
                        min: 100,
                        max: 4000
                    }
                }
            },
            chatbotBehavior: {
                type: "items",
                label: "Chatbot Behavior",
                items: {
                    defaultRole: {
                        ref: "props.defaultRole",
                        label: "Default Role",
                        type: "string",
                        component: "dropdown",
                        options: [
                            { value: "Analyst", label: "Data Analyst" },
                            { value: "HR", label: "HR Professional" },
                            { value: "Manager", label: "Manager" },
                            { value: "Executive", label: "Executive" },
                            { value: "Custom", label: "Custom Role" }
                        ],
                        defaultValue: "Analyst"
                    },
                    customRole: {
                        ref: "props.customRole",
                        label: "Custom Role Description",
                        type: "string",
                        defaultValue: "You are a helpful data analysis assistant",
                        show: function(data) {
                            return data.props && data.props.defaultRole === "Custom";
                        }
                    },
                    enableVoiceInput: {
                        ref: "props.enableVoiceInput",
                        label: "Enable Voice Input",
                        type: "boolean",
                        defaultValue: true
                    },
                    enableQuickActions: {
                        ref: "props.enableQuickActions",
                        label: "Show Quick Action Buttons",
                        type: "boolean",
                        defaultValue: true
                    },
                    maxHistoryLength: {
                        ref: "props.maxHistoryLength",
                        label: "Max Chat History Length",
                        type: "number",
                        defaultValue: 50,
                        min: 10,
                        max: 200
                    }
                }
            },
            dataSettings: {
                type: "items",
                label: "Data Integration",
                items: {
                    maxFields: {
                        ref: "props.maxFields",
                        label: "Maximum Fields to Include",
                        type: "number",
                        defaultValue: 20,
                        min: 5,
                        max: 50
                    },
                    maxRows: {
                        ref: "props.maxRows",
                        label: "Maximum Data Rows to Send",
                        type: "number",
                        defaultValue: 1000,
                        min: 100,
                        max: 5000
                    },
                    includeSelections: {
                        ref: "props.includeSelections",
                        label: "Include Current Selections in Context",
                        type: "boolean",
                        defaultValue: true
                    },
                    autoRefreshData: {
                        ref: "props.autoRefreshData",
                        label: "Auto Refresh Data on Selection Change",
                        type: "boolean",
                        defaultValue: true
                    }
                }
            },
            visualSettings: {
                type: "items",
                label: "Visual Appearance",
                items: {
                    chatbotPosition: {
                        ref: "props.chatbotPosition",
                        label: "Chatbot Position",
                        type: "string",
                        component: "dropdown",
                        options: [
                            { value: "bottom-right", label: "Bottom Right" },
                            { value: "bottom-left", label: "Bottom Left" },
                            { value: "top-right", label: "Top Right" },
                            { value: "top-left", label: "Top Left" }
                        ],
                        defaultValue: "bottom-right"
                    },
                    chatbotTheme: {
                        ref: "props.chatbotTheme",
                        label: "Color Theme",
                        type: "string",
                        component: "dropdown",
                        options: [
                            { value: "default", label: "Default (Purple)" },
                            { value: "blue", label: "Blue" },
                            { value: "green", label: "Green" },
                            { value: "orange", label: "Orange" },
                            { value: "red", label: "Red" }
                        ],
                        defaultValue: "default"
                    },
                    showAppName: {
                        ref: "props.showAppName",
                        label: "Show App Name in Header",
                        type: "boolean",
                        defaultValue: true
                    },
                    enableAnimations: {
                        ref: "props.enableAnimations",
                        label: "Enable Animations",
                        type: "boolean",
                        defaultValue: true
                    },
                    customWelcomeMessage: {
                        ref: "props.customWelcomeMessage",
                        label: "Custom Welcome Message",
                        type: "string",
                        defaultValue: "Hello! I'm your AI assistant. How can I help you analyze your data today?",
                        maxlength: 200
                    }
                }
            },
            advancedSettings: {
                type: "items",
                label: "Advanced Settings",
                items: {
                    enableDebugMode: {
                        ref: "props.enableDebugMode",
                        label: "Enable Debug Mode",
                        type: "boolean",
                        defaultValue: false
                    },
                    customPromptPrefix: {
                        ref: "props.customPromptPrefix",
                        label: "Custom Prompt Prefix",
                        type: "string",
                        defaultValue: "You are an AI assistant specialized in QlikSense data analysis.",
                        maxlength: 500
                    },
                    enableContextMemory: {
                        ref: "props.enableContextMemory",
                        label: "Enable Context Memory",
                        type: "boolean",
                        defaultValue: true
                    },
                    contextWindowSize: {
                        ref: "props.contextWindowSize",
                        label: "Context Window Size (messages)",
                        type: "number",
                        defaultValue: 10,
                        min: 5,
                        max: 50,
                        show: function(data) {
                            return data.props && data.props.enableContextMemory;
                        }
                    }
                }
            }
        }
    };

    var about = {
        type: "items",
        label: "About",
        items: {
            header: {
                label: "QlikSense AI Chatbot Extension",
                style: "header",
                component: "text"
            },
            paragraph1: {
                label: "This extension integrates an AI-powered chatbot with your QlikSense application, allowing users to interact with their data using natural language queries.",
                component: "text"
            },
            paragraph2: {
                label: "Features include:",
                component: "text"
            },
            features: {
                label: "• Natural language data queries\n• Role-based interactions\n• Voice input support\n• Chart and table generation\n• QlikSense Capability API integration\n• Chat history export\n• Custom AI model configuration",
                component: "text"
            },
            version: {
                label: "Version: 1.0.0",
                style: "hint",
                component: "text"
            }
        }
    };

    // Return the property panel definition
    return {
        type: "items",
        component: "accordion",
        items: {
            appearance: appearanceSection,
            chatbotSettings: chatbotSettings,
            about: about
        }
    };
});
