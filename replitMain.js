define([
    'jquery',
    'qlik',
    './properties',
    'text!./template.html',
    'text!./style.css',
    'text!./data.json',
    'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js', // ECharts CDN
    'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js', // XLSX Library
], function($, qlik, props, template, cssContent, jsonData, echarts, XLSX) {
    'use strict';

    // Add CSS to document head
    $('<style>').html(cssContent).appendTo('head');
    var dataObj = JSON.parse(jsonData);
    console.log(dataObj);

    return {
        template: template,
        definition: props,
        controller: ['$scope', '$element', function($scope, $element) {
            const app = qlik.currApp();
            let MainData = [];
            let hypercubeData = {};
            let chatHistory = [];
            let currentUser = 'User';
            let selectedRole = 'Analyst';
            let isListening = false;
            let recognition;
            let chartInstances = {}; // Track chart instances for cleanup
            let currentChartType = null; // Track the current chart type
            let currentChartContainerId = null; // Track the current chart container ID
            let lastChartConfig = null; // Store the last chart configuration
            let previousChartConfig = null; // Store the previous chart configuration for "Go Back"
            let chartcontainerheader = null;

            let sursa = [];
            let allObjData = [];

            // Chart-related keywords for detection
            const chartKeywords = ['chart', 'show chart', 'create chart', 'visualization', 'graph', 'plot', 'diagram', 'visual', 'trend', 'bar chart', 'line chart', 'pie chart', 'scatter plot', 'bar', 'line', 'pie', 'scatter', 'stacked bar', 'area', 'boxplot', 'radar', 'geo', 'tree', 'treemap', 'sankey', 'funnel', 'gauge'];

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

            // Process object data
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

                    if (totalColumns === 0) return [];

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


            myArrayObjects.forEach(function(objectID) {
                fetchDataAndProcess(objectID).then(jsonDataArray => {
                    //console.log(jsonDataArray);
                    allObjData.push(jsonDataArray);
                    sursa = JSON.stringify(allObjData);
                    console.log("all Objects Data in string", sursa);
                }).catch(error => {
                    console.error("Error fetching data:", error);
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
                addMessage('bot', `Hello! I'm your AI assistant for ${$scope.appName || 'this QlikSense app'}. I can help you analyze your data and create interactive visualizations. Try asking me to "create a chart" or "show me a graph"!`);
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

                console.log(query);

                const decryptedKey = "key";

                const baseUrl = "url";

                let model;
                let context = '4o';
                if (context === '8k') {
                    model = "mmc-tech-gpt-35-turbo-smart-latest";
                } else if (context === '16k') {
                    model = 'mmc-tech-gpt-35-turbo-16k-0613';
                } else if (context === '4o') {
                    model = "mmc-tech-gpt-4o-mini-128k-2024-07-18";
                }

                const endpoint = `deployments/${model}/chat/completions`;
                const url = `${baseUrl}${endpoint}`;
                const temp = 0.2; // Ranges 0-2

                let Data = JSON.stringify(hypercubeData);
                let prompt = `You are ${selectedRole}, You are a highly skilled health insurance business analyst. Utilize the JSON data provided below after 'data:', which includes information claims data. Your primary objective is to analyze this data and answer the query asked after the data segment in query:<> format in this message. Always emphasize clarity and correctness in your answers to provide the best possible insights.  response should be pointwise in use html elements`;

                switch (selectedRole) {
                    case 'Analyst':
                        prompt += ` As a skilled analyst, focus on data trends, patterns, and statistical insights.response should be pointwise in use html elements`;
                        break;
                    case 'HR':
                        prompt += ` As an HR professional, emphasize employee-related insights, performance metrics, and organizational trends.response should be pointwise in use html elements`;
                        break;
                    case 'Manager':
                        prompt += ` As a manager, provide strategic insights, performance summaries, and actionable recommendations. response should be pointwise in use html elements`;
                        break;
                    case 'Executive':
                        prompt += ` As an executive, focus on high-level strategic insights, KPIs, and business impact. response should be pointwise in use html elements`;
                        break;
                }
                const isChartRequest = detectChartRequest(query);

                if (isChartRequest) {
                    prompt = `You are ${selectedRole}, a data visualization expert. Based on the QlikSense data provided, create a chart configuration for the user's request.

                    IMPORTANT: Respond with a JSON object containing:
                    1. "message": A brief explanation of the chart
                    2. "chartConfig": A complete ECharts configuration object (in JSON format)
                    3. "chartType": The type of chart (bar, line, pie, scatter, stacked bar, area, boxplot, radar, geo, tree, treemap, sankey, funnel, gauge))


                    The chartConfig should include:
                    - xAxis: with type and data
                    - yAxis: with type
                    - series: with type, data, and name

                    Use the actual data from the provided dataset. Make the chart interactive with hover effects and click handlers.

                    Example format:
                    {
                        "message": "Here's a bar chart showing...",
                        "chartConfig": {
                            "xAxis": {
                                "type": "category",
                                "data": ["Label1", "Label2"]
                            },
                            "yAxis": {
                                "type": "value"
                            },
                            "series": [{
                                "data": [{value: 14109.47, name: 'TN'}],
                                "type": "bar || line || pie || scatter || stacked bar || area || boxplot || radar || geo || tree || treemap || sankey || funnel || gauge",
                                "name": "Dataset Label"
                            }]
                        },
                        "chartType": "bar || line || pie || scatter || stacked bar || area || boxplot || radar || geo || tree || treemap || sankey || funnel || gauge"
                    }

                    for Geo map use following format :


                      option = {
                            title: {


                              left: 'right'
                            },
                            tooltip: {
                              trigger: 'item',
                              showDelay: 0,
                              transitionDuration: 0.2
                            },
                            visualMap: {
                              left: 'right',
                              min: 500000,
                              max: 38000000,
                              inRange: {
                                color: [
                                  '#313695',
                                  '#4575b4',
                                  '#74add1',
                                  '#abd9e9',
                                  '#e0f3f8',
                                  '#ffffbf',
                                  '#fee090',
                                  '#fdae61',
                                  '#f46d43',
                                  '#d73027',
                                  '#a50026'
                                ]
                              },
                              text: ['High', 'Low'],
                              calculable: true
                            },
                            toolbox: {
                              show: true,
                              //orient: 'vertical',
                              left: 'left',
                              top: 'top',
                              feature: {
                                dataView: { readOnly: false },
                                restore: {},
                                saveAsImage: {}
                              }
                            },
                            series: [
                              {
                                name: 'Country Data ',
                                type: 'map',
                                roam: true,
                                map: 'USA',
                                emphasis: {
                                  label: {
                                    show: true
                                  }
                                },
                                data: [
                                  { name: 'Alabama', value: 4822023 },


                                ]
                              }
                            ]
                          }
                    `;
                }

                try {

                    console.log("all Objects Data ", sursa);

                    // **Excel Export Logic**
                    if (query.toLowerCase().startsWith("@create excel")) {
                        const excelQuery = query.substring("@create excel".length).trim(); // Extract the query after the command
                        const excelData = await getExcelData(excelQuery); // Function to fetch data for Excel
                        exportToExcel(excelData, excelQuery); // Generate and download Excel
                        hideTypingIndicator();
                        addMessage('bot', 'Generating Excel file...');
                        return; // Stop further processing
                    }

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${decryptedKey}`
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [{
                                role: "user",
                                content: `${prompt} data:${sursa} query:${query}`
                            }],
                            temperature: temp,
                            max_tokens: 2000,
                            response_format: isChartRequest ? {
                                type: "json_object"
                            } : undefined
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    const aiResponse = data.choices[0].message.content;

                    hideTypingIndicator();

                    if (isChartRequest) {
                        try {
                            const chartResponse = JSON.parse(aiResponse);
                            lastChartConfig = chartResponse.chartConfig; // Store the chart config
                            const messageText = chartResponse.message || 'Here\'s your chart:';
                            addMessage('bot', messageText, chartResponse.chartConfig, chartResponse.chartType);

                        } catch (parseError) {
                            console.error('Error parsing chart response:', parseError);
                            addMessage('bot', 'I encountered an error generating the chart. Here\'s the analysis instead: ' + aiResponse);
                        }
                    } else {
                        addMessage('bot', aiResponse);
                    }

                } catch (error) {
                    console.error('Error calling AI API:', error);
                    hideTypingIndicator();
                    addMessage('bot', 'I apologize, but I encountered an error processing your request. Please try again.');
                }
            }

            // **Function to Fetch Data for Excel**
            async function getExcelData(query) {
                // Implement logic to fetch data based on the query
                // This could involve filtering hypercubeData or allObjData based on the query
                // For example:
                const filteredData = allObjData.flat().filter(item => {
                    // Implement your filtering logic here based on the query
                    // This is a placeholder - replace with your actual filtering
                    return Object.values(item).some(value => String(value).toLowerCase().includes(query.toLowerCase()));
                });
                return filteredData;
            }

            // **Function to Generate and Download Excel**
            function exportToExcel(data, query) {
                if (!data || data.length === 0) {
                    alert('No data found for the Excel export.');
                    return;
                }

                // Create a new workbook
                const wb = XLSX.utils.book_new();

                // Convert data to worksheet format
                const ws = XLSX.utils.json_to_sheet(data);

                // Add the worksheet to the workbook
                XLSX.utils.book_append_sheet(wb, ws, 'Data');

                // Generate Excel file
                const excelBuffer = XLSX.write(wb, {
                    bookType: 'xlsx',
                    type: 'array'
                });
                const excelData = new Uint8Array(excelBuffer);

                // Create a Blob and trigger download
                const blob = new Blob([excelData], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `excel_export_${query.replace(/\s+/g, '_')}.xlsx`; // Filename
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }

            function addMessage(sender, message, chartConfig = null, chartType = null) {
                const $messages = $element.find('.chat-messages');
                const timestamp = new Date().toLocaleTimeString();
                const messageId = 'msg_' + Date.now();

                let messageClass = sender === 'user' ? 'user-message' : 'bot-message';
                let icon = sender === 'user' ? '\ud83d\udc64' : '\ud83e\udd16';
                let name = sender === 'user' ? currentUser : 'AI Assistant';

                if (sender === 'system') {
                    messageClass = 'system-message';
                    icon = '\u2699\ufe0f';
                    name = 'System';
                }


                message = message.replace(/```html/g, '').replace(/```/g, '').trim();

                let messageHtml = `
                    <div class="message ${messageClass}" id="${messageId}">
                        <div class="message-content">
                            <div class="message-header">
                                <span class="${sender}-icon">${icon}</span>
                                <span class="${sender}-name">${name}</span>
                                <span class="timestamp">${timestamp}</span>
                            </div>
                            <div class="message-text">${message}</div>
                            ${chartConfig ? '<div class="chart-container" id="chart_' + messageId + '"></div>' : ''}
                            <div class="hear-responce ${sender}" id="chartheading_${messageId}">
                                <button class="speak-button" >
                                    <i class="fas fa-volume-up"></i>
                                </button>
                                <button class="copy-response" >
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;


                $messages.append(messageHtml);
                $messages.scrollTop($messages[0].scrollHeight);

                // Generate chart if chartConfig is provided
                if (chartConfig) {
                    currentChartContainerId = `chart_${messageId}`; // Store the container ID

                    chartcontainerheader = `chartheading_${messageId}`;
                    setTimeout(() => {
                        generateChart(currentChartContainerId, chartcontainerheader, chartConfig, chartType);
                    }, 100);
                }

                // Add to chat history
                chatHistory.push({
                    sender: sender,
                    message: message,
                    timestamp: timestamp,
                    chartConfig: chartConfig
                });
            }

            function generateChart(containerId, chartcontainerheader, chartConfig, chartType) {

                const container = document.getElementById(containerId);
                const containerheader = document.getElementById(chartcontainerheader);
                if (!container) {
                    console.error('Chart container not found:', containerId);
                    return;
                }

                // Clear previous content
                $(container).empty();

                const $buttonsHtml = $(`

                        <button class="go-back-button"><i class="fas fa-arrow-left"></i></button>

                `);

                // Add "Go Back" and "Export to Excel" buttons using jQuery


                // Initialize chart
                if (chartConfig.series[0].type == 'map') {
                    echarts.registerMap('USA', dataObj);
                }
                const myChart = echarts.init(container);


                // Add tooltip for hover effect
                chartConfig.tooltip = {
                    trigger: 'item'
                    //  formatter: '{a} <br/>{b} : {c} ({d}%)' // Customize as needed
                };

                // Set chart options
                myChart.setOption(chartConfig);

                // Add click event listener for drilldown
                myChart.on('click', function(params) {

                    $(containerheader).append($buttonsHtml);

                    // Store the current chart config as the previous config
                    previousChartConfig = JSON.parse(JSON.stringify(chartConfig));

                    // Handle drilldown logic here - Modify chart directly
                    if (lastChartConfig && lastChartConfig.series) {
                        // Example: Filter data based on the clicked data point


                        const newData = lastChartConfig.series.map((series, i) => {
                            if (series.type == 'line') {
                                return {
                                    ...series,
                                    data: series.data.filter(item => item == params.value) // Example filter
                                };
                            } else if (series.type == 'scatter') {
                                return {
                                    ...series,
                                    data: series.data.filter(item => item.value[1] == params.value[1]) // Example filter
                                };
                            } else {
                                return {
                                    ...series,
                                    data: series.data.filter(item => item.value == params.value) // Example filter
                                };
                            }
                        });

                        //const newData = lastChartConfig.series.data.filter(item => item === params.value);

                        // Update the chart options with the filtered data
                        const newChartConfig = {
                            ...lastChartConfig,
                            series: newData
                        };

                        chartConfig = newChartConfig; // Update the chartConfig
                        myChart.setOption(newChartConfig);
                    }
                });

                // "Go Back" button functionality using jQuery
                let headerID = "#" + chartcontainerheader;

                $(document).on("click", `${headerID} .go-back-button`, function() {
                    console.log("back button clicked");
                    // $(container).find('.go-back-button').on('click', function() {
                    if (previousChartConfig) {

                        myChart.setOption(previousChartConfig);

                        if (previousChartConfig.series[0].type == 'bar') {
                            const resizeObserver = new ResizeObserver(() => {
                                myChart.resize();
                            });
                        }
                        chartConfig = previousChartConfig; // Restore the chartConfig
                        previousChartConfig = null; // Clear the previous config
                    }
                    $(this).remove();
                });

                // "Export to Excel" button functionality using jQuery

                // Save chart instance
                chartInstances[containerId] = myChart;

                // Add resize observer for responsiveness
                const resizeObserver = new ResizeObserver(() => {
                    myChart.resize();
                });
                resizeObserver.observe(container);

                // **Add Download Chart Button**
                const $downloadButton = $('<button>')
                    .addClass('download-chart-button')
                    .html('<i class="fas fa-download"></i> Download Chart')
                    .on('click', function() {
                        downloadChartImage(containerId);
                    });
                $(container).append($downloadButton);
            }

            // **Function to Download Chart as Image**
            function downloadChartImage(containerId) {
                const container = document.getElementById(containerId);
                const chart = chartInstances[containerId];

                if (!chart) {
                    console.error('Chart instance not found:', containerId);
                    return;
                }

                const imgData = chart.getDataURL({
                    type: 'png',
                    pixelRatio: 2, // Adjust for higher resolution
                    backgroundColor: '#fff' // Set background color
                });

                const link = document.createElement('a');
                link.href = imgData;
                link.download = 'chart.png'; // Filename
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            function showTypingIndicator() {
                const $messages = $element.find('.chat-messages');
                const typingHtml = `
                    <div class="message typing-indicator">
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
                    alert('Voice recognition is not supported in your browser.');
                    return;
                }

                const $voiceBtn = $element.find('.voice-button');

                if (isListening) {
                    recognition.stop();
                    isListening = false;
                    $voiceBtn.removeClass('listening');
                } else {
                    recognition.start();
                    isListening = true;
                    $voiceBtn.addClass('listening');
                }

                recognition.onresult = function(event) {
                    const transcript = event.results[0][0].transcript;
                    $element.find('.chat-input').val(transcript);
                    isListening = false;
                    $voiceBtn.removeClass('listening');
                };

                recognition.onerror = function(event) {
                    console.error('Speech recognition error:', event.error);
                    isListening = false;
                    $voiceBtn.removeClass('listening');
                };
            }

            function downloadChatHistory() {
                /*const dataStr = JSON.stringify(chatHistory, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

                const exportFileDefaultName = `chat_history_${new Date().toISOString().split('T')[0]}.json`;

                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();


                */


                const pdfContent = chatHistory.map(msg =>
                    `[${msg.timestamp}] ${msg.user}: ${msg.message}`
                ).join('\n\n');

                // Create and download file
                const blob = new Blob([pdfContent], {
                    type: 'text/plain'
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `chatbot_history_${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }



            //response voice start code
            $(document).ready(function() {
                let isSpeaking = false;
                let speechSynthesis = window.speechSynthesis;
                let utterance;
                speechSynthesis.cancel();
                $(document).on('click', '.speak-button', function() {
                    var text = $(this).parent().prev().text().trim();
                    if (isSpeaking) {
                        stopSpeech(this);
                    } else {
                        startSpeech(text, this);
                    }
                });

                function startSpeech(text, $this) {
                    // Get the text from the textarea


                    // Check if the browser supports speech synthesis
                    if ('speechSynthesis' in window) {
                        // Create a new speech synthesis utterance
                        var utterance = new SpeechSynthesisUtterance(text);
                        isSpeaking = true;

                        // Optionally set properties like voice, pitch, and rate
                        utterance.pitch = 1; // Range: 0 to 2
                        utterance.rate = 1; // Range: 0.1 to 10
                        utterance.volume = 1; // Range: 0 to 1

                        // Speak the text
                        window.speechSynthesis.speak(utterance);

                        $($this).html('<i class="fa fa-ban" aria-hidden="true"></i>');
                        $($this).addClass("active-speech");


                        utterance.onend = function() {
                            isSpeaking = false;
                            $($this).html('<i class="fa fa-volume-up" aria-hidden="true"></i>');
                            $($this).removeClass("active-speech");
                        }

                    } else {
                        alert('Please enter some text to speak.');
                    }
                }

                function stopSpeech($this) {
                    if (isSpeaking) {
                        speechSynthesis.cancel();
                        isSpeaking = false;
                        $($this).html('<i class="fa fa-volume-up" aria-hidden="true"></i>');
                        $($this).removeClass("active-speech");

                    }
                }
                $(window).on('beforeunload', function() {
                    stopSpeech();
                });
            });


            $(document).on("click", ".copy-response", function() {
                // Get the parent div
                const parentDiv = $(this).parent().prev();

                // Get all text inside the child elements of the parent div
                const textToCopy = parentDiv.text().trim();

                // Create a temporary textarea to hold the text to copy
                const tempInput = $('<textarea>').val(textToCopy).appendTo('body').select();

                // Copy the text
                document.execCommand('copy');

                // Remove the temporary textarea
                tempInput.remove();

                // Optional: Alert the user that the text has been copied
                //console.log('Text copied to clipboard!');
            });




            $(document).ready(function() {
                const keywords = [
                    "@generate the chart",
                    "@create excel"
                ];

                const $input = $('#commandInput');
                const $suggestionBox = $('#suggestionBox');

                $input.on('input', function() {
                    const val = $(this).val();
                    const lastChar = val.slice(-1);
                    // Show suggestions when last char is '@'
                    if (lastChar === '@') {
                        showSuggestions('');
                    } else if (val.includes('@')) {
                        // Get the part after '@' for filtering
                        const atIndex = val.lastIndexOf('@');
                        const query = val.slice(atIndex).toLowerCase();
                        showSuggestions(query);
                    } else {
                        $suggestionBox.hide();
                    }
                });

                function showSuggestions(query) {
                    const filtered = keywords.filter(k => k.toLowerCase().startsWith(query));
                    if (filtered.length === 0) {
                        $suggestionBox.hide();
                        return;
                    }
                    $suggestionBox.empty();
                    filtered.forEach(item => {
                        const $item = $('<div class="suggestion-item"></div>').text(item);
                        $item.on('click', function() {
                            selectSuggestion(item);
                        });
                        $suggestionBox.append($item);
                    });
                    // Position the suggestion box below input
                    const offset = $input.offset();
                    $suggestionBox.show();
                }

                function selectSuggestion(suggestion) {
                    const val = $input.val();
                    const atIndex = val.lastIndexOf('@');
                    const newVal = val.slice(0, atIndex) + suggestion + ' ';
                    $input.val(newVal);
                    $suggestionBox.hide();
                    $input.focus();
                }
            });


            $('#commandInput').on('change', function() {
                const command = $(this).val().trim();
                if (command.startsWith("@generate the chart")) {
                    // Generate chart
                } else if (command.startsWith("@create excel")) {
                    // Create Excel
                }
                // Add more commands as needed
            });


            // Cleanup function
            $scope.$on('$destroy', function() {
                // Destroy all
