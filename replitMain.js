define([
    'jquery',
    'qlik',
    './properties',
    'text!./template.html',
    'text!./style.css'
], function($, qlik, props, template, cssContent) {
    'use strict';

    // Add CSS to document head
    $('<style>').html(cssContent).appendTo('head');

    // Load Highcharts library
    if (!window.Highcharts) {
        const script = document.createElement('script');
        script.src = 'https://code.highcharts.com/highcharts.js';
        script.onload = function() {
            // Load additional Highcharts modules
            const drilldownScript = document.createElement('script');
            drilldownScript.src = 'https://code.highcharts.com/modules/drilldown.js';
            document.head.appendChild(drilldownScript);
        };
        document.head.appendChild(script);
    }

    return {
        template: template,
        definition: props,
        
        controller: ['$scope', '$element', function($scope, $element, layout) {
            
            console.log($scope);
            
            const app = qlik.currApp();
            let MainData = [];
            let hypercubeData = {};
            let chatHistory = [];
            let currentUser = 'User';
            let selectedRole = 'Analyst';
            let isListening = false;
            let recognition;
            let chartCounter = 0;

            // Chart-related keywords for detection
            const chartKeywords = ['chart', 'show chart', 'create chart', 'visualization', 'visualize', 'graph', 'plot', 'display chart', 'generate chart'];

            // Initialize Speech Recognition
            if ('webkitSpeechRecognition' in window) {
                recognition = new webkitSpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.lang = 'en-US';
            }

            // Fetch app data on initialization
            $scope.$watch('layout', function(newVal) {
                if (newVal) {
                    fetchAppData();
                    initializeChatbot();
                }
            });

            function fetchAppData() {
                // Get app info
                app.getAppLayout().then(function(layout) {
                    $scope.appName = layout["layout"].qTitle || 'QlikSense App';
                    $scope.$apply();
                });

                // Create hypercube to fetch all app data
                const hypercubeDef = {
                    qDimensions: [],
                    qMeasures: [],
                    qInitialDataFetch: [{
                        qTop: 0,
                        qLeft: 0,
                        qHeight: 1000,
                        qWidth: 50
                    }]
                };

                // Get all fields and create dimensions/measures
                app.getList('FieldList').then(function(reply) {
                    console.log("reply", reply.layout.qFieldList.qItems);
                    const fields = reply.layout.qFieldList.qItems;
                    
                    fields.forEach(function(field, index) {
                        if (index < 20) {
                            if (field.qCardinal < 100) {
                                hypercubeDef.qDimensions.push({
                                    qDef: {
                                        qFieldDefs: [field.qName],
                                        qSortCriterias: [{
                                            qSortByState: 1,
                                            qSortByAscii: 1
                                        }]
                                    }
                                });
                            } else {
                                hypercubeDef.qMeasures.push({
                                    qDef: {
                                        qDef: `Sum([${field.qName}])`,
                                        qLabel: field.qName
                                    }
                                });
                            }
                        }
                    });

                    // Create hypercube object
                    app.createCube(hypercubeDef).then(function(model) {
                        model.getLayout().then(function(layout) {
                            console.log("data-layout", layout);
                            hypercubeData = {
                                dimensions: layout.qHyperCube.qDimensionInfo,
                                measures: layout.qHyperCube.qMeasureInfo,
                                data: layout.qHyperCube.qDataPages[0] ? layout.qHyperCube.qDataPages[0].qMatrix : []
                            };
                        });
                    });
                });
            }

            const objects = $scope.$parent.layout.props.objects;
            console.log(objects);
            
            const elements = objects.split(',').map(item => item.trim());
            const myArrayObjects = [];
            
            elements.forEach(element => myArrayObjects.push(element));

            const fetchDataAndProcess = async (objectID) => {
                const jsonDataArray = [];
              
                try {
                  const model = await app.getObject(objectID);
                  const layout = model.layout;
                  console.log(model);
              
                  if (!layout.qHyperCube) {
                    return [];
                  }
              
                  const totalDimensions = layout.qHyperCube.qDimensionInfo.length;
                  const totalMeasures = layout.qHyperCube.qMeasureInfo.length;
                  const totalColumns = totalDimensions + totalMeasures;
              
                  if(totalColumns === 0) return [];
              
                  const totalRows = layout.qHyperCube.qSize.qcy;
              
                  const pageSize = 500;
                  const totalPages = Math.min(Math.ceil(totalRows / pageSize), 5);
              
                  const headers = layout.qHyperCube.qDimensionInfo
                                  .map(d => d.qFallbackTitle)
                                  .concat(layout.qHyperCube.qMeasureInfo.map(m => m.qFallbackTitle))
                                  .filter(h => h !== undefined);
              
                  for (let currentPage = 0; currentPage < totalPages; currentPage++) {
                    const qTop = currentPage * pageSize;
                    const qHeight = Math.min(pageSize, totalRows - qTop);
              
                    if (qHeight <= 0) break;
              
                    const dataPages = await model.getHyperCubeData('/qHyperCubeDef', [{
                      qTop,
                      qLeft: 0,
                      qWidth: totalColumns,
                      qHeight
                    }]);
              
                    dataPages[0].qMatrix.forEach(data => {
                      const jsonData = {};
                      headers.forEach((header, index) => {
                        jsonData[header] = data[index]?.qText || null;
                      });
                      jsonDataArray.push(jsonData);
                    });
                  }
                } catch (error) {
                  console.warn(`Error fetching data for object ${objectID}:`, error);
                  return [];
                }
                return jsonDataArray;
            };

            let sursa = [];
            let allObjData = [];
            
            myArrayObjects.forEach(function (objectID) {
                fetchDataAndProcess(objectID).then(jsonDataArray => {
                    console.log(jsonDataArray);
                    allObjData.push(jsonDataArray);
                    sursa = JSON.stringify(allObjData);
                    console.log("all Objects Data in string", sursa);
                }).catch(error => {
                    console.error("Error fetching and processing data:", error);
                });
            });

            function initializeChatbot() {
                const $chatbot = $element.find('.chatbot-container');
                const $toggle = $element.find('.chatbot-toggle');
                const $close = $element.find('.chatbot-close');
                const $sendBtn = $element.find('.send-button');
                const $input = $element.find('.chat-input');
                const $voiceBtn = $element.find('.voice-button');
                const $roleSelect = $element.find('.role-select');
                const $downloadBtn = $element.find('.download-history');

                // Toggle chatbot
                $toggle.on('click', function() {
                    $chatbot.addClass('active');
                    $input.focus();
                });

                // Close chatbot
                $close.on('click', function() {
                    $chatbot.removeClass('active');
                });

                // Send message
                $sendBtn.on('click', sendMessage);
                $input.on('keypress', function(e) {
                    if (e.which === 13) {
                        sendMessage();
                    }
                });

                // Voice input
                $voiceBtn.on('click', toggleVoiceInput);

                // Role selection
                $roleSelect.on('change', function() {
                    selectedRole = $(this).val();
                    addMessage('system', `Role changed to: ${selectedRole}`);
                });

                // Download history
                $downloadBtn.on('click', downloadChatHistory);

                // Initialize with welcome message
                addMessage('bot', `Hello! I'm your AI assistant for ${$scope.appName || 'this QlikSense app'}. I can help you analyze your data and create interactive charts. How can I help you today?`);
            }

            function sendMessage() {
                const $input = $element.find('.chat-input');
                const message = $input.val().trim();
                
                if (!message) return;

                // Add user message
                addMessage('user', message);
                $input.val('');

                // Show typing indicator
                showTypingIndicator();

                // Send to AI API
                processWithAI(message);
            }

            function detectChartRequest(query) {
                const lowerQuery = query.toLowerCase();
                return chartKeywords.some(keyword => lowerQuery.includes(keyword));
            }

            async function processWithAI(query) {
                MainData.push(hypercubeData);
                
                const decryptedKey = process.env.OPENAI_API_KEY || "sk-your-api-key-here";
                const baseUrl = "https://api.openai.com/v1/";
                
                const isChartRequest = detectChartRequest(query);
                
                let Data = JSON.stringify(hypercubeData);
                
                let prompt = `You are ${selectedRole}, a highly skilled business analyst. Utilize the JSON data provided below after 'data:', which includes information from the QlikSense application. Your primary objective is to analyze this data and answer the query asked after the data segment in query:<> format in this message. Always emphasize clarity and correctness in your answers to provide the best possible insights.`;

                // Enhanced prompt for chart requests
                if (isChartRequest) {
                    prompt = `You are ${selectedRole}, a highly skilled business analyst with expertise in data visualization. Analyze the provided JSON data and create an interactive chart configuration based on the user's request. 

                    IMPORTANT: If the user is asking for a chart, respond with ONLY a JSON object in this exact format:
                    {
                        "type": "chart",
                        "chartType": "bar|line|pie|scatter|column",
                        "title": "Chart Title",
                        "xAxis": "field_name_for_x_axis",
                        "yAxis": "field_name_for_y_axis",
                        "series": [
                            {
                                "name": "Series Name",
                                "data": [
                                    {"name": "Category 1", "y": 100, "drilldown": "category1"},
                                    {"name": "Category 2", "y": 200, "drilldown": "category2"}
                                ]
                            }
                        ],
                        "drilldown": {
                            "series": [
                                {
                                    "id": "category1",
                                    "name": "Category 1 Details",
                                    "data": [["Subcategory 1", 50], ["Subcategory 2", 50]]
                                }
                            ]
                        },
                        "description": "Brief description of what the chart shows"
                    }

                    Use the actual field names and data from the provided dataset. If the data is not suitable for charting, respond with a regular text explanation instead.`;
                }

                // Update prompt based on selected role
                switch (selectedRole) {
                    case 'Analyst':
                        prompt += ' Focus on detailed data analysis, trends, and statistical insights.';
                        break;
                    case 'HR':
                        prompt += ' Focus on human resources metrics, employee data, and workforce analytics.';
                        break;
                    case 'Manager':
                        prompt += ' Focus on management KPIs, performance metrics, and strategic insights.';
                        break;
                    case 'Executive':
                        prompt += ' Focus on high-level strategic insights, executive summaries, and key business metrics.';
                        break;
                }

                const requestBody = {
                    model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
                    messages: [
                        {
                            role: "system",
                            content: prompt
                        },
                        {
                            role: "user",
                            content: `data: ${Data}\n\nquery: <${query}>`
                        }
                    ],
                    max_tokens: 2000,
                    temperature: 0.2
                };

                // Add JSON format requirement for chart requests
                if (isChartRequest) {
                    requestBody.response_format = { type: "json_object" };
                }

                try {
                    const response = await fetch(`${baseUrl}chat/completions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${decryptedKey}`
                        },
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    const aiResponse = data.choices[0].message.content;
                    
                    hideTypingIndicator();
                    
                    // Handle chart response
                    if (isChartRequest) {
                        try {
                            const chartConfig = JSON.parse(aiResponse);
                            if (chartConfig.type === 'chart') {
                                addChartMessage('bot', chartConfig);
                            } else {
                                addMessage('bot', aiResponse);
                            }
                        } catch (parseError) {
                            console.error('Error parsing chart configuration:', parseError);
                            addMessage('bot', aiResponse);
                        }
                    } else {
                        addMessage('bot', aiResponse);
                    }
                    
                } catch (error) {
                    console.error('Error calling OpenAI API:', error);
                    hideTypingIndicator();
                    addMessage('bot', 'I apologize, but I encountered an error while processing your request. Please try again.');
                }
            }

            function addMessage(sender, message) {
                const $messages = $element.find('.chat-messages');
                const timestamp = new Date().toLocaleTimeString();
                const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                const messageHtml = `
                    <div class="message ${sender}-message" id="${messageId}">
                        <div class="message-content">
                            <div class="message-header">
                                <span class="${sender}-icon">${sender === 'user' ? '👤' : '🤖'}</span>
                                <span class="${sender}-name">${sender === 'user' ? currentUser : 'AI Assistant'}</span>
                                <span class="timestamp">${timestamp}</span>
                            </div>
                            <div class="message-text">${message}</div>
                            <div class="hear-responce">
                                <button class="speak-button" onclick="speakMessage('${messageId}')">
                                    <i class="fas fa-volume-up"></i>
                                </button>
                                <button class="copy-button" onclick="copyMessage('${messageId}')">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                
                $messages.append(messageHtml);
                $messages.scrollTop($messages[0].scrollHeight);
                
                // Add to chat history
                chatHistory.push({
                    sender: sender,
                    message: message,
                    timestamp: timestamp
                });
            }

            function addChartMessage(sender, chartConfig) {
                const $messages = $element.find('.chat-messages');
                const timestamp = new Date().toLocaleTimeString();
                const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const chartId = `chart_${++chartCounter}`;
                
                const messageHtml = `
                    <div class="message ${sender}-message chart-message" id="${messageId}">
                        <div class="message-content">
                            <div class="message-header">
                                <span class="${sender}-icon">📊</span>
                                <span class="${sender}-name">Chart Generator</span>
                                <span class="timestamp">${timestamp}</span>
                            </div>
                            <div class="message-text">
                                <div class="chart-description">${chartConfig.description || 'Interactive chart generated based on your data'}</div>
                                <div class="chart-container" id="${chartId}">
                                    <div class="chart-loading">
                                        <div class="loading-spinner"></div>
                                        <span>Generating chart...</span>
                                    </div>
                                </div>
                            </div>
                            <div class="hear-responce">
                                <button class="copy-button" onclick="copyChartConfig('${messageId}')">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                
                $messages.append(messageHtml);
                $messages.scrollTop($messages[0].scrollHeight);
                
                // Render chart after DOM is ready
                setTimeout(() => {
                    renderChart(chartId, chartConfig);
                }, 100);
                
                // Add to chat history
                chatHistory.push({
                    sender: sender,
                    message: `Chart: ${chartConfig.title}`,
                    timestamp: timestamp,
                    chartConfig: chartConfig
                });
            }

            function renderChart(containerId, chartConfig) {
                const container = document.getElementById(containerId);
                if (!container) {
                    console.error('Chart container not found:', containerId);
                    return;
                }

                // Check if Highcharts is loaded
                if (typeof Highcharts === 'undefined') {
                    container.innerHTML = '<div class="chart-error">Chart library not loaded. Please refresh the page.</div>';
                    return;
                }

                try {
                    // Remove loading spinner
                    container.innerHTML = '';

                    // Create Highcharts configuration
                    const highchartsConfig = {
                        chart: {
                            type: chartConfig.chartType || 'column',
                            height: 300
                        },
                        title: {
                            text: chartConfig.title
                        },
                        xAxis: {
                            type: chartConfig.chartType === 'pie' ? undefined : 'category',
                            title: {
                                text: chartConfig.xAxis
                            }
                        },
                        yAxis: {
                            title: {
                                text: chartConfig.yAxis
                            }
                        },
                        series: chartConfig.series || [],
                        drilldown: chartConfig.drilldown || {},
                        responsive: {
                            rules: [{
                                condition: {
                                    maxWidth: 500
                                },
                                chartOptions: {
                                    legend: {
                                        enabled: false
                                    }
                                }
                            }]
                        },
                        credits: {
                            enabled: false
                        }
                    };

                    // Special handling for pie charts
                    if (chartConfig.chartType === 'pie') {
                        delete highchartsConfig.xAxis;
                        delete highchartsConfig.yAxis;
                        if (highchartsConfig.series[0]) {
                            highchartsConfig.series[0].innerSize = '50%';
                        }
                    }

                    // Create the chart
                    Highcharts.chart(containerId, highchartsConfig);

                } catch (error) {
                    console.error('Error rendering chart:', error);
                    container.innerHTML = '<div class="chart-error">Failed to render chart. Please try again.</div>';
                }
            }

            function showTypingIndicator() {
                const $messages = $element.find('.chat-messages');
                const typingHtml = `
                    <div class="message bot-message typing-indicator">
                        <div class="message-content">
                            <div class="typing-animation">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                `;
                $messages.append(typingHtml);
                $messages.scrollTop($messages[0].scrollHeight);
            }

            function hideTypingIndicator() {
                $element.find('.typing-indicator').remove();
            }

            function toggleVoiceInput() {
                if (!recognition) {
                    addMessage('system', 'Voice input is not supported in this browser.');
                    return;
                }

                if (isListening) {
                    recognition.stop();
                    isListening = false;
                    $element.find('.voice-button').removeClass('listening');
                } else {
                    recognition.start();
                    isListening = true;
                    $element.find('.voice-button').addClass('listening');
                }
            }

            if (recognition) {
                recognition.onresult = function(event) {
                    const transcript = event.results[0][0].transcript;
                    $element.find('.chat-input').val(transcript);
                    isListening = false;
                    $element.find('.voice-button').removeClass('listening');
                };

                recognition.onerror = function() {
                    isListening = false;
                    $element.find('.voice-button').removeClass('listening');
                    addMessage('system', 'Voice recognition error. Please try again.');
                };
            }

            function downloadChatHistory() {
                if (chatHistory.length === 0) {
                    addMessage('system', 'No chat history to download.');
                    return;
                }

                const historyText = chatHistory.map(entry => 
                    `[${entry.timestamp}] ${entry.sender}: ${entry.message}`
                ).join('\n');

                const blob = new Blob([historyText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `chat_history_${new Date().toISOString().split('T')[0]}.txt`;
                a.click();
                URL.revokeObjectURL(url);
            }

            // Global functions for message interactions
            window.speakMessage = function(messageId) {
                const messageElement = document.getElementById(messageId);
                if (messageElement && 'speechSynthesis' in window) {
                    const text = messageElement.querySelector('.message-text').textContent;
                    const utterance = new SpeechSynthesisUtterance(text);
                    speechSynthesis.speak(utterance);
                }
            };

            window.copyMessage = function(messageId) {
                const messageElement = document.getElementById(messageId);
                if (messageElement) {
                    const text = messageElement.querySelector('.message-text').textContent;
                    navigator.clipboard.writeText(text).then(() => {
                        // Visual feedback
                        const button = messageElement.querySelector('.copy-button');
                        const originalHTML = button.innerHTML;
                        button.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => {
                            button.innerHTML = originalHTML;
                        }, 1000);
                    });
                }
            };

            window.copyChartConfig = function(messageId) {
                const messageElement = document.getElementById(messageId);
                if (messageElement) {
                    const chartEntry = chatHistory.find(entry => entry.chartConfig);
                    if (chartEntry) {
                        const configText = JSON.stringify(chartEntry.chartConfig, null, 2);
                        navigator.clipboard.writeText(configText).then(() => {
                            // Visual feedback
                            const button = messageElement.querySelector('.copy-button');
                            const originalHTML = button.innerHTML;
                            button.innerHTML = '<i class="fas fa-check"></i>';
                            setTimeout(() => {
                                button.innerHTML = originalHTML;
                            }, 1000);
                        });
                    }
                }
            };
        }]
    };
});
