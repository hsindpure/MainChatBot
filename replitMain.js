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

    // Load D3.js library with better error handling
    const loadD3 = () => {
        return new Promise((resolve, reject) => {
            if (window.d3 && typeof window.d3.scaleBand === 'function') {
                console.log('D3.js already loaded');
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://d3js.org/d3.v7.min.js';
            script.onload = function() {
                console.log('D3.js loaded successfully, version:', d3.version);
                console.log('scaleBand function available:', typeof d3.scaleBand);
                resolve();
            };
            script.onerror = function() {
                console.error('Failed to load D3.js from CDN');
                reject(new Error('D3.js failed to load'));
            };
            document.head.appendChild(script);
        });
    };
    
    // Initialize D3.js loading
    loadD3().catch(error => {
        console.error('D3.js initialization failed:', error);
    });

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
            let chartInstances = {}; // Track D3.js chart instances for cleanup

            // Chart-related keywords for detection
            const chartKeywords = ['chart', 'show chart', 'create chart', 'visualization', 'graph', 'plot', 'diagram', 'visual', 'trend', 'bar chart', 'line chart', 'pie chart', 'scatter plot', 'donut chart', 'area chart'];

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
                
                const decryptedKey = "openAI_Key";
                const baseUrl = "openai/v1/";
                
                let model;
                let context = '4o';
                if (context === '8k') {
                    model = "mmc-tech";
                } else if (context === '16k') {
                    model = 'mmc-tech';
                } else if (context === '4o') {
                    model = "mmc-tech-gpt";
                }

                const endpoint = `deployments/${model}/chat/completions`;
                const url = `${baseUrl}${endpoint}`;
                const temp = 0.2;
                
                let Data = JSON.stringify(hypercubeData);
                let prompt = `You are ${selectedRole}, a highly skilled data analyst. Utilize the JSON data provided below after 'data:', which includes information from QlikSense. Your primary objective is to analyze this data and answer the query asked after the data segment in query:<> format in this message. Always emphasize clarity and correctness in your answers to provide the best possible insights.`;

                const isChartRequest = detectChartRequest(query);
                
                if (isChartRequest) {
                    prompt = `You are ${selectedRole}, a data visualization expert. Based on the QlikSense data provided, create a D3.js chart configuration for the user's request. 

                    IMPORTANT: Respond with a JSON object containing:
                    1. "message": A brief explanation of the chart
                    2. "chartData": Processed data array ready for D3.js
                    3. "chartType": The type of chart (bar, line, pie, scatter, donut, area, etc.)
                    4. "chartConfig": Configuration object with chart settings
                    
                    The response should include:
                    - chartType: one of "bar", "line", "pie", "scatter", "donut", "area"
                    - chartData: array of objects with data points
                    - chartConfig: settings like dimensions, colors, labels
                    
                    Use the actual data from the provided dataset. The chart will be interactive with hover effects and click handlers.
                    
                    Example format:
                    {
                        "message": "Here's a bar chart showing...",
                        "chartType": "bar",
                        "chartData": [
                            {"label": "Category A", "value": 25, "color": "#667eea"},
                            {"label": "Category B", "value": 30, "color": "#764ba2"}
                        ],
                        "chartConfig": {
                            "width": 450,
                            "height": 300,
                            "margin": {"top": 20, "right": 20, "bottom": 40, "left": 40},
                            "xLabel": "Categories",
                            "yLabel": "Values",
                            "title": "Chart Title",
                            "colorScheme": ["#667eea", "#764ba2", "#f093fb", "#f5576c", "#4facfe", "#00f2fe"]
                        }
                    }`;
                }

                switch (selectedRole) {
                    case 'Analyst':
                        prompt += ` As a skilled analyst, focus on data trends, patterns, and statistical insights.`;
                        break;
                    case 'HR':
                        prompt += ` As an HR professional, emphasize employee-related insights, performance metrics, and organizational trends.`;
                        break;
                    case 'Manager':
                        prompt += ` As a manager, provide strategic insights, performance summaries, and actionable recommendations.`;
                        break;
                    case 'Executive':
                        prompt += ` As an executive, focus on high-level strategic insights, KPIs, and business impact.`;
                        break;
                }

                prompt += `\n\nData: ${Data}\n\nQuery: <${query}>`;

                try {
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
                                content: prompt
                            }],
                            temperature: temp,
                            max_tokens: 2000,
                            response_format: isChartRequest ? { type: "json_object" } : undefined
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
                            addMessage('bot', chartResponse.message || 'Here\'s your chart:', chartResponse);
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

            function addMessage(sender, message, chartData = null) {
                const $messages = $element.find('.chat-messages');
                const timestamp = new Date().toLocaleTimeString();
                const messageId = 'msg_' + Date.now();
                
                let messageClass = sender === 'user' ? 'user-message' : 'bot-message';
                let icon = sender === 'user' ? '👤' : '🤖';
                let name = sender === 'user' ? currentUser : 'AI Assistant';
                
                if (sender === 'system') {
                    messageClass = 'system-message';
                    icon = '⚙️';
                    name = 'System';
                }

                let messageHtml = `
                    <div class="message ${messageClass}" id="${messageId}">
                        <div class="message-content">
                            <div class="message-header">
                                <span class="${sender}-icon">${icon}</span>
                                <span class="${sender}-name">${name}</span>
                                <span class="timestamp">${timestamp}</span>
                            </div>
                            <div class="message-text">${message}</div>
                            ${chartData ? `<div class="chart-container" id="chart_${messageId}"></div>` : ''}
                            <div class="hear-responce ${sender}">
                                <button class="speak-button" onclick="speakText('${message.replace(/'/g, "\\'")}')">
                                    <i class="fas fa-volume-up"></i>
                                </button>
                                <button class="copy-button" onclick="copyToClipboard('${message.replace(/'/g, "\\'")}')">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                $messages.append(messageHtml);
                $messages.scrollTop($messages[0].scrollHeight);

                // Generate chart if chartData is provided
                if (chartData) {
                    setTimeout(() => {
                        generateD3Chart(`chart_${messageId}`, chartData);
                    }, 100);
                }

                // Add to chat history
                chatHistory.push({
                    sender: sender,
                    message: message,
                    timestamp: timestamp,
                    chartData: chartData
                });
            }

            function generateD3Chart(containerId, chartData) {
                const container = document.getElementById(containerId);
                if (!container) {
                    console.error('Chart container not found:', containerId);
                    return;
                }

                // Add loading state
                container.innerHTML = '<div class="chart-loading">Generating D3.js chart...</div>';
                
                // Wait for D3.js to load with timeout and better error handling
                let loadAttempts = 0;
                const maxAttempts = 100; // 10 seconds timeout
                
                const initChart = async () => {
                    loadAttempts++;
                    
                    // Try to ensure D3.js is loaded
                    try {
                        await loadD3();
                    } catch (error) {
                        console.error('Failed to load D3.js:', error);
                    }
                    
                    if (typeof d3 === 'undefined' || typeof d3.scaleBand !== 'function') {
                        if (loadAttempts >= maxAttempts) {
                            console.error('D3.js failed to load within timeout');
                            container.innerHTML = '<div class="chart-error">D3.js library failed to load. Please refresh the page and try again.<br><small>Error: scaleBand function not available</small></div>';
                            return;
                        }
                        console.log(`D3.js not loaded yet, waiting... (attempt ${loadAttempts}/${maxAttempts})`);
                        setTimeout(initChart, 100);
                        return;
                    }

                    // Debug D3.js availability
                    console.log('D3.js version:', d3.version);
                    console.log('D3.js scaleBand available:', typeof d3.scaleBand);
                    console.log('Available D3 functions:', Object.keys(d3).filter(key => key.startsWith('scale')));
                    
                    container.innerHTML = '';
                    
                    const { chartType, chartData: data, chartConfig } = chartData;
                    const config = {
                        width: 450,
                        height: 300,
                        margin: { top: 20, right: 20, bottom: 40, left: 40 },
                        colorScheme: ["#667eea", "#764ba2", "#f093fb", "#f5576c", "#4facfe", "#00f2fe"],
                        ...chartConfig
                    };

                    try {
                        // Destroy existing chart if it exists
                        if (chartInstances[containerId]) {
                            d3.select(`#${containerId}`).selectAll("*").remove();
                        }

                        // Create SVG
                        const svg = d3.select(`#${containerId}`)
                            .append("svg")
                            .attr("width", config.width)
                            .attr("height", config.height)
                            .style("background", "white")
                            .style("border-radius", "8px");

                        // Add title if provided
                        if (config.title) {
                            svg.append("text")
                                .attr("x", config.width / 2)
                                .attr("y", config.margin.top / 2)
                                .attr("text-anchor", "middle")
                                .style("font-size", "16px")
                                .style("font-weight", "bold")
                                .style("fill", "#2d3748")
                                .text(config.title);
                        }

                        // Generate chart based on type
                        switch (chartType) {
                            case 'bar':
                                generateBarChart(svg, data, config, containerId);
                                break;
                            case 'line':
                                generateLineChart(svg, data, config, containerId);
                                break;
                            case 'pie':
                            case 'donut':
                                generatePieChart(svg, data, config, containerId, chartType === 'donut');
                                break;
                            case 'scatter':
                                generateScatterChart(svg, data, config, containerId);
                                break;
                            case 'area':
                                generateAreaChart(svg, data, config, containerId);
                                break;
                            default:
                                generateBarChart(svg, data, config, containerId);
                        }

                        chartInstances[containerId] = { svg, data, config };
                        
                    } catch (error) {
                        console.error('Error creating D3 chart:', error);
                        container.innerHTML = '<div class="chart-error">Error generating chart. Please try again.</div>';
                    }
                };

                initChart();
            }

            function generateBarChart(svg, data, config, containerId) {
                const { width, height, margin, colorScheme } = config;
                const innerWidth = width - margin.left - margin.right;
                const innerHeight = height - margin.top - margin.bottom;

                const g = svg.append("g")
                    .attr("transform", `translate(${margin.left},${margin.top})`);

                // Scales - with fallback for compatibility
                let xScale;
                try {
                    xScale = d3.scaleBand()
                        .domain(data.map(d => d.label))
                        .range([0, innerWidth])
                        .padding(0.1);
                } catch (error) {
                    console.error('scaleBand error:', error);
                    console.log('Available D3 scale functions:', Object.keys(d3).filter(key => key.includes('scale')));
                    throw new Error('D3.js scaleBand function not available');
                }

                const yScale = d3.scaleLinear()
                    .domain([0, d3.max(data, d => d.value)])
                    .range([innerHeight, 0]);

                const colorScale = d3.scaleOrdinal()
                    .domain(data.map(d => d.label))
                    .range(colorScheme);

                // Axes
                g.append("g")
                    .attr("transform", `translate(0,${innerHeight})`)
                    .call(d3.axisBottom(xScale))
                    .selectAll("text")
                    .style("font-size", "12px");

                g.append("g")
                    .call(d3.axisLeft(yScale))
                    .selectAll("text")
                    .style("font-size", "12px");

                // Bars
                const bars = g.selectAll(".bar")
                    .data(data)
                    .enter().append("rect")
                    .attr("class", "bar")
                    .attr("x", d => xScale(d.label))
                    .attr("width", xScale.bandwidth())
                    .attr("y", d => yScale(d.value))
                    .attr("height", d => innerHeight - yScale(d.value))
                    .attr("fill", d => colorScale(d.label))
                    .style("cursor", "pointer")
                    .on("mouseover", function(event, d) {
                        d3.select(this).attr("opacity", 0.8);
                        
                        // Tooltip
                        const tooltip = d3.select("body").append("div")
                            .attr("class", "d3-tooltip")
                            .style("opacity", 0)
                            .style("position", "absolute")
                            .style("background", "rgba(0,0,0,0.8)")
                            .style("color", "white")
                            .style("padding", "8px")
                            .style("border-radius", "4px")
                            .style("font-size", "12px")
                            .style("pointer-events", "none")
                            .style("z-index", "10000");

                        tooltip.transition().duration(200).style("opacity", 1);
                        tooltip.html(`${d.label}: ${d.value}`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", function() {
                        d3.select(this).attr("opacity", 1);
                        d3.selectAll(".d3-tooltip").remove();
                    })
                    .on("click", function(event, d) {
                        const drilldownQuery = `Tell me more about ${d.label} with value ${d.value}`;
                        addMessage('user', `[Drilldown] ${drilldownQuery}`);
                        showTypingIndicator();
                        processWithAI(drilldownQuery);
                    });

                // Add axis labels
                if (config.xLabel) {
                    g.append("text")
                        .attr("x", innerWidth / 2)
                        .attr("y", innerHeight + 35)
                        .attr("text-anchor", "middle")
                        .style("font-size", "12px")
                        .text(config.xLabel);
                }

                if (config.yLabel) {
                    g.append("text")
                        .attr("transform", "rotate(-90)")
                        .attr("y", 0 - margin.left)
                        .attr("x", 0 - (innerHeight / 2))
                        .attr("dy", "1em")
                        .attr("text-anchor", "middle")
                        .style("font-size", "12px")
                        .text(config.yLabel);
                }
            }

            function generateLineChart(svg, data, config, containerId) {
                const { width, height, margin, colorScheme } = config;
                const innerWidth = width - margin.left - margin.right;
                const innerHeight = height - margin.top - margin.bottom;

                const g = svg.append("g")
                    .attr("transform", `translate(${margin.left},${margin.top})`);

                // Scales
                const xScale = d3.scalePoint()
                    .domain(data.map(d => d.label))
                    .range([0, innerWidth]);

                const yScale = d3.scaleLinear()
                    .domain([0, d3.max(data, d => d.value)])
                    .range([innerHeight, 0]);

                // Line generator
                const line = d3.line()
                    .x(d => xScale(d.label))
                    .y(d => yScale(d.value))
                    .curve(d3.curveMonotoneX);

                // Axes
                g.append("g")
                    .attr("transform", `translate(0,${innerHeight})`)
                    .call(d3.axisBottom(xScale));

                g.append("g")
                    .call(d3.axisLeft(yScale));

                // Line
                g.append("path")
                    .datum(data)
                    .attr("fill", "none")
                    .attr("stroke", colorScheme[0])
                    .attr("stroke-width", 2)
                    .attr("d", line);

                // Points
                g.selectAll(".dot")
                    .data(data)
                    .enter().append("circle")
                    .attr("class", "dot")
                    .attr("cx", d => xScale(d.label))
                    .attr("cy", d => yScale(d.value))
                    .attr("r", 4)
                    .attr("fill", colorScheme[0])
                    .style("cursor", "pointer")
                    .on("mouseover", function(event, d) {
                        d3.select(this).attr("r", 6);
                        
                        const tooltip = d3.select("body").append("div")
                            .attr("class", "d3-tooltip")
                            .style("opacity", 0)
                            .style("position", "absolute")
                            .style("background", "rgba(0,0,0,0.8)")
                            .style("color", "white")
                            .style("padding", "8px")
                            .style("border-radius", "4px")
                            .style("font-size", "12px")
                            .style("pointer-events", "none")
                            .style("z-index", "10000");

                        tooltip.transition().duration(200).style("opacity", 1);
                        tooltip.html(`${d.label}: ${d.value}`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", function() {
                        d3.select(this).attr("r", 4);
                        d3.selectAll(".d3-tooltip").remove();
                    })
                    .on("click", function(event, d) {
                        const drilldownQuery = `Tell me more about ${d.label} with value ${d.value}`;
                        addMessage('user', `[Drilldown] ${drilldownQuery}`);
                        showTypingIndicator();
                        processWithAI(drilldownQuery);
                    });
            }

            function generatePieChart(svg, data, config, containerId, isDonut = false) {
                const { width, height, colorScheme } = config;
                const radius = Math.min(width, height) / 2 - 20;
                const innerRadius = isDonut ? radius * 0.5 : 0;

                const g = svg.append("g")
                    .attr("transform", `translate(${width/2},${height/2})`);

                const pie = d3.pie()
                    .value(d => d.value)
                    .sort(null);

                const path = d3.arc()
                    .outerRadius(radius)
                    .innerRadius(innerRadius);

                const colorScale = d3.scaleOrdinal()
                    .domain(data.map(d => d.label))
                    .range(colorScheme);

                const arcs = g.selectAll(".arc")
                    .data(pie(data))
                    .enter().append("g")
                    .attr("class", "arc");

                arcs.append("path")
                    .attr("d", path)
                    .attr("fill", d => colorScale(d.data.label))
                    .style("cursor", "pointer")
                    .on("mouseover", function(event, d) {
                        d3.select(this).attr("opacity", 0.8);
                        
                        const tooltip = d3.select("body").append("div")
                            .attr("class", "d3-tooltip")
                            .style("opacity", 0)
                            .style("position", "absolute")
                            .style("background", "rgba(0,0,0,0.8)")
                            .style("color", "white")
                            .style("padding", "8px")
                            .style("border-radius", "4px")
                            .style("font-size", "12px")
                            .style("pointer-events", "none")
                            .style("z-index", "10000");

                        tooltip.transition().duration(200).style("opacity", 1);
                        tooltip.html(`${d.data.label}: ${d.data.value}`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", function() {
                        d3.select(this).attr("opacity", 1);
                        d3.selectAll(".d3-tooltip").remove();
                    })
                    .on("click", function(event, d) {
                        const drilldownQuery = `Tell me more about ${d.data.label} with value ${d.data.value}`;
                        addMessage('user', `[Drilldown] ${drilldownQuery}`);
                        showTypingIndicator();
                        processWithAI(drilldownQuery);
                    });

                // Add labels
                arcs.append("text")
                    .attr("transform", d => `translate(${path.centroid(d)})`)
                    .attr("text-anchor", "middle")
                    .style("font-size", "12px")
                    .style("fill", "white")
                    .text(d => d.data.label);
            }

            function generateScatterChart(svg, data, config, containerId) {
                const { width, height, margin, colorScheme } = config;
                const innerWidth = width - margin.left - margin.right;
                const innerHeight = height - margin.top - margin.bottom;

                const g = svg.append("g")
                    .attr("transform", `translate(${margin.left},${margin.top})`);

                // Scales (assuming data has x and y values)
                const xScale = d3.scaleLinear()
                    .domain(d3.extent(data, d => d.x || d.value))
                    .range([0, innerWidth]);

                const yScale = d3.scaleLinear()
                    .domain(d3.extent(data, d => d.y || d.value))
                    .range([innerHeight, 0]);

                const colorScale = d3.scaleOrdinal()
                    .domain(data.map(d => d.label))
                    .range(colorScheme);

                // Axes
                g.append("g")
                    .attr("transform", `translate(0,${innerHeight})`)
                    .call(d3.axisBottom(xScale));

                g.append("g")
                    .call(d3.axisLeft(yScale));

                // Points
                g.selectAll(".dot")
                    .data(data)
                    .enter().append("circle")
                    .attr("class", "dot")
                    .attr("cx", d => xScale(d.x || d.value))
                    .attr("cy", d => yScale(d.y || d.value))
                    .attr("r", 5)
                    .attr("fill", d => colorScale(d.label))
                    .style("cursor", "pointer")
                    .on("mouseover", function(event, d) {
                        d3.select(this).attr("r", 7);
                        
                        const tooltip = d3.select("body").append("div")
                            .attr("class", "d3-tooltip")
                            .style("opacity", 0)
                            .style("position", "absolute")
                            .style("background", "rgba(0,0,0,0.8)")
                            .style("color", "white")
                            .style("padding", "8px")
                            .style("border-radius", "4px")
                            .style("font-size", "12px")
                            .style("pointer-events", "none")
                            .style("z-index", "10000");

                        tooltip.transition().duration(200).style("opacity", 1);
                        tooltip.html(`${d.label}: (${d.x || d.value}, ${d.y || d.value})`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", function() {
                        d3.select(this).attr("r", 5);
                        d3.selectAll(".d3-tooltip").remove();
                    })
                    .on("click", function(event, d) {
                        const drilldownQuery = `Tell me more about ${d.label}`;
                        addMessage('user', `[Drilldown] ${drilldownQuery}`);
                        showTypingIndicator();
                        processWithAI(drilldownQuery);
                    });
            }

            function generateAreaChart(svg, data, config, containerId) {
                const { width, height, margin, colorScheme } = config;
                const innerWidth = width - margin.left - margin.right;
                const innerHeight = height - margin.top - margin.bottom;

                const g = svg.append("g")
                    .attr("transform", `translate(${margin.left},${margin.top})`);

                // Scales
                const xScale = d3.scalePoint()
                    .domain(data.map(d => d.label))
                    .range([0, innerWidth]);

                const yScale = d3.scaleLinear()
                    .domain([0, d3.max(data, d => d.value)])
                    .range([innerHeight, 0]);

                // Area generator
                const area = d3.area()
                    .x(d => xScale(d.label))
                    .y0(innerHeight)
                    .y1(d => yScale(d.value))
                    .curve(d3.curveMonotoneX);

                // Axes
                g.append("g")
                    .attr("transform", `translate(0,${innerHeight})`)
                    .call(d3.axisBottom(xScale));

                g.append("g")
                    .call(d3.axisLeft(yScale));

                // Area
                g.append("path")
                    .datum(data)
                    .attr("fill", colorScheme[0])
                    .attr("fill-opacity", 0.7)
                    .attr("stroke", colorScheme[0])
                    .attr("stroke-width", 2)
                    .attr("d", area);

                // Points
                g.selectAll(".dot")
                    .data(data)
                    .enter().append("circle")
                    .attr("class", "dot")
                    .attr("cx", d => xScale(d.label))
                    .attr("cy", d => yScale(d.value))
                    .attr("r", 4)
                    .attr("fill", colorScheme[0])
                    .style("cursor", "pointer")
                    .on("mouseover", function(event, d) {
                        d3.select(this).attr("r", 6);
                        
                        const tooltip = d3.select("body").append("div")
                            .attr("class", "d3-tooltip")
                            .style("opacity", 0)
                            .style("position", "absolute")
                            .style("background", "rgba(0,0,0,0.8)")
                            .style("color", "white")
                            .style("padding", "8px")
                            .style("border-radius", "4px")
                            .style("font-size", "12px")
                            .style("pointer-events", "none")
                            .style("z-index", "10000");

                        tooltip.transition().duration(200).style("opacity", 1);
                        tooltip.html(`${d.label}: ${d.value}`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", function() {
                        d3.select(this).attr("r", 4);
                        d3.selectAll(".d3-tooltip").remove();
                    })
                    .on("click", function(event, d) {
                        const drilldownQuery = `Tell me more about ${d.label} with value ${d.value}`;
                        addMessage('user', `[Drilldown] ${drilldownQuery}`);
                        showTypingIndicator();
                        processWithAI(drilldownQuery);
                    });
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
                const dataStr = JSON.stringify(chatHistory, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                
                const exportFileDefaultName = `chat_history_${new Date().toISOString().split('T')[0]}.json`;
                
                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();
            }

            // Global functions for message controls
            window.speakText = function(text) {
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.rate = 0.8;
                    utterance.pitch = 1;
                    speechSynthesis.speak(utterance);
                } else {
                    alert('Text-to-speech is not supported in your browser.');
                }
            };

            window.copyToClipboard = function(text) {
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(() => {
                        // Show temporary feedback
                        const feedback = document.createElement('div');
                        feedback.textContent = 'Copied!';
                        feedback.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #4CAF50; color: white; padding: 8px 16px; border-radius: 4px; z-index: 10001;';
                        document.body.appendChild(feedback);
                        setTimeout(() => document.body.removeChild(feedback), 2000);
                    });
                } else {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                }
            };

            // Cleanup function
            $scope.$on('$destroy', function() {
                // Destroy all chart instances
                Object.values(chartInstances).forEach(chart => {
                    if (chart) chart.destroy();
                });
                chartInstances = {};
            });
        }]
    };
});
