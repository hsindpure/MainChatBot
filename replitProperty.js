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
                        defaultValue: "AI Chatbot Assistant with Interactive Charts"
                    },
                    subtitle: {
                        defaultValue: "Powered by OpenAI with Highcharts Integration"
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
                        label: "Enter Object Ids (comma-separated)",
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
            chartSettings: {
                type: "items",
                label: "Interactive Chart Settings",
                items: {
                    enableCharts: {
                        ref: "props.enableCharts",
                        label: "Enable Interactive Charts",
                        type: "boolean",
                        defaultValue: true
                    },
                    chartLibrary: {
                        ref: "props.chartLibrary",
                        label: "Primary Chart Library",
                        type: "string",
                        component: "dropdown",
                        options: [
                            { value: "highcharts", label: "Highcharts (Recommended)" },
                            { value: "chartjs", label: "Chart.js" },
                            { value: "auto", label: "Auto-select" }
                        ],
                        defaultValue: "highcharts",
                        show: function(data) {
                            return data.props && data.props.enableCharts;
                        }
                    },
                    enableDrilldown: {
                        ref: "props.enableDrilldown",
                        label: "Enable Drill-down Functionality",
                        type: "boolean",
                        defaultValue: true,
                        show: function(data) {
                            return data.props && data.props.enableCharts;
                        }
                    },
                    chartAnimations: {
                        ref: "props.chartAnimations",
                        label: "Enable Chart Animations",
                        type: "boolean",
                        defaultValue: true,
                        show: function(data) {
                            return data.props && data.props.enableCharts;
                        }
                    },
                    chartExport: {
                        ref: "props.chartExport",
                        label: "Enable Chart Export",
                        type: "boolean",
                        defaultValue: true,
                        show: function(data) {
                            return data.props && data.props.enableCharts;
                        }
                    },
                    defaultChartType: {
                        ref: "props.defaultChartType",
                        label: "Default Chart Type",
                        type: "string",
                        component: "dropdown",
                        options: [
                            { value: "bar", label: "Bar Chart" },
                            { value: "line", label: "Line Chart" },
                            { value: "pie", label: "Pie Chart" },
                            { value: "scatter", label: "Scatter Plot" },
                            { value: "area", label: "Area Chart" },
                            { value: "treemap", label: "Treemap" },
                            { value: "sunburst", label: "Sunburst" }
                        ],
                        defaultValue: "bar",
                        show: function(data) {
                            return data.props && data.props.enableCharts;
                        }
                    },
                    chartHeight: {
                        ref: "props.chartHeight",
                        label: "Chart Height (pixels)",
                        type: "number",
                        defaultValue: 400,
                        min: 200,
                        max: 800,
                        show: function(data) {
                            return data.props && data.props.enableCharts;
                        }
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
                    },
                    chartKeywords: {
                        ref: "props.chartKeywords",
                        label: "Chart Trigger Keywords (comma-separated)",
                        type: "string",
                        defaultValue: "chart,visualization,graph,plot,show chart,create chart,drill down,interactive",
                        show: function(data) {
                            return data.props && data.props.enableCharts;
                        }
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
                    },
                    chartDataLimit: {
                        ref: "props.chartDataLimit",
                        label: "Chart Data Point Limit",
                        type: "number",
                        defaultValue: 100,
                        min: 10,
                        max: 500,
                        show: function(data) {
                            return data.props && data.props.enableCharts;
                        }
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
                        defaultValue: "Hello! I'm your AI assistant. How can I help you analyze your data today? You can ask me to create charts, visualizations, or drill down into your data!",
                        maxlength: 300
                    },
                    chartColorScheme: {
                        ref: "props.chartColorScheme",
                        label: "Chart Color Scheme",
                        type: "string",
                        component: "dropdown",
                        options: [
                            { value: "default", label: "Default Colors" },
                            { value: "blue", label: "Blue Palette" },
                            { value: "green", label: "Green Palette" },
                            { value: "warm", label: "Warm Colors" },
                            { value: "cool", label: "Cool Colors" }
                        ],
                        defaultValue: "default",
                        show: function(data) {
                            return data.props && data.props.enableCharts;
                        }
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
                        defaultValue: "You are an AI assistant specialized in QlikSense data analysis with interactive chart capabilities.",
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
                    },
                    chartCacheEnabled: {
                        ref: "props.chartCacheEnabled",
                        label: "Enable Chart Data Caching",
                        type: "boolean",
                        defaultValue: true,
                        show: function(data) {
                            return data.props && data.props.enableCharts;
                        }
                    },
                    chartCacheTimeout: {
                        ref: "props.chartCacheTimeout",
                        label: "Chart Cache Timeout (minutes)",
                        type: "number",
                        defaultValue: 15,
                        min: 1,
                        max: 120,
                        show: function(data) {
                            return data.props && data.props.enableCharts && data.props.chartCacheEnabled;
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
                label: "QlikSense AI Chatbot Extension with Interactive Charts",
                style: "header",
                component: "text"
            },
            paragraph1: {
                label: "This extension integrates an AI-powered chatbot with your QlikSense application, featuring advanced interactive chart generation capabilities using Highcharts and Chart.js libraries.",
                component: "text"
            },
            paragraph2: {
                label: "Enhanced Features:",
                component: "text"
            },
            features: {
                label: "• Natural language data queries with chart generation\n• Interactive drill-down charts with breadcrumb navigation\n• Multi-level data exploration\n• Voice input support with chart interactions\n• Real-time chart export (PNG, PDF, SVG)\n• Responsive chart containers\n• Multiple chart types (bar, line, pie, scatter, area, treemap, sunburst)\n• QlikSense Capability API integration\n• Chat history export with chart references\n• Custom AI model configuration\n• Advanced chart animations and interactions",
                component: "text"
            },
            chartLibraries: {
                label: "Chart Libraries Used:",
                component: "text"
            },
            libraries: {
                label: "• Highcharts - Primary library for advanced interactivity\n• Chart.js - Fallback for basic charts\n• Drill-down and export modules\n• Interactive tooltips and legends",
                component: "text"
            },
            version: {
                label: "Version: 2.0.0 - Interactive Charts Edition",
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

