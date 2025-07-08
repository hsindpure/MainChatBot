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

    // Add chart libraries to document head if not already present
    if (!window.Highcharts) {
        $('<script>').attr('src', 'https://code.highcharts.com/highcharts.js').appendTo('head');
        $('<script>').attr('src', 'https://code.highcharts.com/modules/drilldown.js').appendTo('head');
        $('<script>').attr('src', 'https://code.highcharts.com/modules/exporting.js').appendTo('head');
        $('<script>').attr('src', 'https://code.highcharts.com/modules/export-data.js').appendTo('head');
    }
    
    if (!window.Chart) {
        $('<script>').attr('src', 'https://cdn.jsdelivr.net/npm/chart.js').appendTo('head');
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
            let drilldownStack = [];

            // Chart keywords detection
            const chartKeywords = [
                'chart', 'show chart', 'create chart', 'visualization', 'visualize',
                'graph', 'plot', 'bar chart', 'line chart', 'pie chart', 'scatter plot',
                'area chart', 'treemap', 'sunburst', 'drill down', 'drill-down',
                'interactive', 'dashboard', 'visual', 'display data', 'show data visually'
            ];

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

            // Get object data
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
                addMessage('bot', `Hello! I'm your AI assistant for ${$scope.appName || 'this QlikSense app'}. How can I help you analyze your data today? You can ask me to create charts, visualizations, or drill down into your data!`);
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

                // Check if message contains chart keywords
                const isChartRequest = chartKeywords.some(keyword => 
                    message.toLowerCase().includes(keyword.toLowerCase())
                );

                if (isChartRequest) {
                    processChartRequest(message);
                } else {
                    processWithAI(message);
                }
            }

            function processChartRequest(query) {
                console.log("Processing chart request:", query);
                
                // Remove typing indicator
                hideTypingIndicator();
                
                // Determine chart type based on query
                const chartType = determineChartType(query);
                console.log("Determined chart type:", chartType);
                
                // Generate chart data
                const chartData = prepareChartData(hypercubeData, chartType);
                
                if (chartData && chartData.length > 0) {
                    // Create chart response
                    const chartId = `chart_${++chartCounter}`;
                    const chartResponse = `I've created a ${chartType} chart for you based on your data. You can interact with it by clicking on data points for drill-down functionality.`;
                    
                    addMessage('bot', chartResponse);
                    renderChart(chartId, chartType, chartData, query);
                } else {
                    addMessage('bot', "I couldn't generate a chart with the available data. Please ensure your data contains the necessary fields for visualization.");
                }
            }

            function determineChartType(query) {
                const lowerQuery = query.toLowerCase();
                
                if (lowerQuery.includes('bar') || lowerQuery.includes('column')) return 'bar';
                if (lowerQuery.includes('line') || lowerQuery.includes('trend')) return 'line';
                if (lowerQuery.includes('pie') || lowerQuery.includes('donut')) return 'pie';
                if (lowerQuery.includes('scatter') || lowerQuery.includes('plot')) return 'scatter';
                if (lowerQuery.includes('area')) return 'area';
                if (lowerQuery.includes('treemap')) return 'treemap';
                if (lowerQuery.includes('sunburst')) return 'sunburst';
                
                // Default to bar chart
                return 'bar';
            }

            function prepareChartData(data, chartType) {
                if (!data || !data.data || data.data.length === 0) {
                    return null;
                }

                const dimensions = data.dimensions || [];
                const measures = data.measures || [];
                const rawData = data.data;

                if (dimensions.length === 0 || measures.length === 0) {
                    return null;
                }

                // Process data for different chart types
                switch (chartType) {
                    case 'pie':
                        return preparePieData(rawData, dimensions[0], measures[0]);
                    case 'scatter':
                        return prepareScatterData(rawData, measures);
                    case 'treemap':
                        return prepareTreemapData(rawData, dimensions, measures[0]);
                    case 'sunburst':
                        return prepareSunburstData(rawData, dimensions, measures[0]);
                    default:
                        return prepareBarLineData(rawData, dimensions[0], measures[0]);
                }
            }

            function prepareBarLineData(rawData, dimension, measure) {
                const chartData = [];
                const categories = [];
                const series = [];

                rawData.forEach(row => {
                    const dimValue = row[0]?.qText || 'Unknown';
                    const measureValue = parseFloat(row[1]?.qNum) || 0;
                    
                    categories.push(dimValue);
                    series.push({
                        name: dimValue,
                        y: measureValue,
                        drilldown: dimValue.toLowerCase().replace(/\s+/g, '-')
                    });
                });

                return {
                    categories: categories,
                    series: [{
                        name: measure?.qFallbackTitle || 'Value',
                        data: series,
                        colorByPoint: true
                    }],
                    drilldown: generateDrilldownData(rawData, dimension, measure)
                };
            }

            function preparePieData(rawData, dimension, measure) {
                const pieData = [];
                
                rawData.forEach(row => {
                    const dimValue = row[0]?.qText || 'Unknown';
                    const measureValue = parseFloat(row[1]?.qNum) || 0;
                    
                    pieData.push({
                        name: dimValue,
                        y: measureValue,
                        drilldown: dimValue.toLowerCase().replace(/\s+/g, '-')
                    });
                });

                return {
                    series: [{
                        name: measure?.qFallbackTitle || 'Value',
                        data: pieData
                    }],
                    drilldown: generateDrilldownData(rawData, dimension, measure)
                };
            }

            function prepareScatterData(rawData, measures) {
                if (measures.length < 2) return null;

                const scatterData = [];
                
                rawData.forEach(row => {
                    const xValue = parseFloat(row[0]?.qNum) || 0;
                    const yValue = parseFloat(row[1]?.qNum) || 0;
                    
                    scatterData.push([xValue, yValue]);
                });

                return {
                    series: [{
                        name: 'Data Points',
                        data: scatterData
                    }]
                };
            }

            function prepareTreemapData(rawData, dimensions, measure) {
                const treemapData = [];
                
                rawData.forEach(row => {
                    const dimValue = row[0]?.qText || 'Unknown';
                    const measureValue = parseFloat(row[1]?.qNum) || 0;
                    
                    treemapData.push({
                        name: dimValue,
                        value: measureValue,
                        colorValue: measureValue
                    });
                });

                return {
                    series: [{
                        name: measure?.qFallbackTitle || 'Value',
                        data: treemapData
                    }]
                };
            }

            function prepareSunburstData(rawData, dimensions, measure) {
                // Simplified sunburst data preparation
                const sunburstData = [];
                
                rawData.forEach(row => {
                    const dimValue = row[0]?.qText || 'Unknown';
                    const measureValue = parseFloat(row[1]?.qNum) || 0;
                    
                    sunburstData.push({
                        id: dimValue,
                        parent: '',
                        name: dimValue,
                        value: measureValue
                    });
                });

                return {
                    series: [{
                        name: measure?.qFallbackTitle || 'Value',
                        data: sunburstData
                    }]
                };
            }

            function generateDrilldownData(rawData, dimension, measure) {
                const drilldownData = [];
                
                // Generate sample drill-down data
                rawData.forEach(row => {
                    const dimValue = row[0]?.qText || 'Unknown';
                    const measureValue = parseFloat(row[1]?.qNum) || 0;
                    
                    drilldownData.push({
                        id: dimValue.toLowerCase().replace(/\s+/g, '-'),
                        name: `${dimValue} Breakdown`,
                        data: [
                            ['Q1', Math.floor(measureValue * 0.3)],
                            ['Q2', Math.floor(measureValue * 0.25)],
                            ['Q3', Math.floor(measureValue * 0.25)],
                            ['Q4', Math.floor(measureValue * 0.2)]
                        ]
                    });
                });

                return drilldownData;
            }

            function renderChart(chartId, chartType, chartData, query) {
                const chartContainer = `
                    <div class="chart-container" id="${chartId}">
                        <div class="chart-header">
                            <div class="chart-title">${getChartTitle(chartType, query)}</div>
                            <div class="chart-controls">
                                <button class="chart-export-btn" onclick="exportChart('${chartId}')">
                                    <i class="fas fa-download"></i> Export
                                </button>
                                <button class="chart-fullscreen-btn" onclick="toggleChartFullscreen('${chartId}')">
                                    <i class="fas fa-expand"></i> Fullscreen
                                </button>
                            </div>
                        </div>
                        <div class="chart-breadcrumb" id="${chartId}-breadcrumb">
                            <span class="breadcrumb-item active">Main View</span>
                        </div>
                        <div class="chart-loading" id="${chartId}-loading">
                            <div class="loading-spinner"></div>
                            <span>Loading chart...</span>
                        </div>
                        <div class="chart-content" id="${chartId}-content" style="width: 100%; height: 400px;"></div>
                    </div>
                `;

                // Add chart container to the last bot message
                const $lastMessage = $element.find('.chat-messages .message:last-child .message-content');
                $lastMessage.append(chartContainer);

                // Wait for libraries to load
                setTimeout(() => {
                    if (window.Highcharts) {
                        renderHighchart(chartId, chartType, chartData);
                    } else if (window.Chart) {
                        renderChartJs(chartId, chartType, chartData);
                    } else {
                        $(`#${chartId}-loading`).html('<p>Chart libraries failed to load. Please refresh the page.</p>');
                    }
                }, 1000);
            }

            function renderHighchart(chartId, chartType, chartData) {
                const $loading = $(`#${chartId}-loading`);
                const $content = $(`#${chartId}-content`);
                
                $loading.show();

                try {
                    const chartConfig = {
                        chart: {
                            type: chartType === 'bar' ? 'column' : chartType,
                            backgroundColor: 'transparent'
                        },
                        title: {
                            text: null
                        },
                        xAxis: {
                            categories: chartData.categories,
                            labels: {
                                style: {
                                    fontSize: '11px'
                                }
                            }
                        },
                        yAxis: {
                            title: {
                                text: null
                            },
                            labels: {
                                style: {
                                    fontSize: '11px'
                                }
                            }
                        },
                        legend: {
                            enabled: chartType === 'pie' || chartType === 'line'
                        },
                        plotOptions: {
                            series: {
                                cursor: 'pointer',
                                point: {
                                    events: {
                                        click: function() {
                                            handleChartDrilldown(chartId, this);
                                        }
                                    }
                                }
                            },
                            column: {
                                colorByPoint: true
                            },
                            pie: {
                                allowPointSelect: true,
                                cursor: 'pointer',
                                dataLabels: {
                                    enabled: true,
                                    format: '<b>{point.name}</b>: {point.percentage:.1f} %'
                                }
                            }
                        },
                        series: chartData.series,
                        drilldown: {
                            series: chartData.drilldown || []
                        },
                        exporting: {
                            enabled: true,
                            buttons: {
                                contextButton: {
                                    enabled: false
                                }
                            }
                        },
                        credits: {
                            enabled: false
                        }
                    };

                    // Special handling for treemap and sunburst
                    if (chartType === 'treemap' || chartType === 'sunburst') {
                        chartConfig.chart.type = chartType;
                        delete chartConfig.xAxis;
                        delete chartConfig.yAxis;
                    }

                    const chart = Highcharts.chart(`${chartId}-content`, chartConfig);
                    
                    // Store chart reference for export functionality
                    window[`chart_${chartId}`] = chart;
                    
                    $loading.hide();
                    $content.show();
                    
                } catch (error) {
                    console.error('Error rendering Highchart:', error);
                    $loading.html('<p>Error rendering chart. Please try again.</p>');
                }
            }

            function renderChartJs(chartId, chartType, chartData) {
                const $loading = $(`#${chartId}-loading`);
                const $content = $(`#${chartId}-content`);
                
                $loading.show();

                try {
                    const canvas = document.createElement('canvas');
                    canvas.id = `${chartId}-canvas`;
                    $content.append(canvas);

                    const ctx = canvas.getContext('2d');
                    
                    const chartConfig = {
                        type: chartType === 'bar' ? 'bar' : chartType,
                        data: {
                            labels: chartData.categories || [],
                            datasets: [{
                                label: chartData.series[0]?.name || 'Data',
                                data: chartData.series[0]?.data.map(item => item.y || item) || [],
                                backgroundColor: [
                                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                                    '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
                                ],
                                borderColor: [
                                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                                    '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
                                ],
                                borderWidth: 1
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: chartType === 'pie'
                                }
                            },
                            onClick: function(event, elements) {
                                if (elements.length > 0) {
                                    const index = elements[0].index;
                                    const label = chartData.categories[index];
                                    handleChartJsDrilldown(chartId, label, index);
                                }
                            }
                        }
                    };

                    const chart = new Chart(ctx, chartConfig);
                    
                    // Store chart reference
                    window[`chart_${chartId}`] = chart;
                    
                    $loading.hide();
                    $content.show();
                    
                } catch (error) {
                    console.error('Error rendering Chart.js:', error);
                    $loading.html('<p>Error rendering chart. Please try again.</p>');
                }
            }

            function handleChartDrilldown(chartId, point) {
                const breadcrumb = $(`#${chartId}-breadcrumb`);
                const currentBreadcrumb = breadcrumb.find('.breadcrumb-item.active').text();
                
                // Add to drilldown stack
                drilldownStack.push({
                    chartId: chartId,
                    level: currentBreadcrumb,
                    point: point
                });
                
                // Update breadcrumb
                breadcrumb.find('.breadcrumb-item').removeClass('active');
                breadcrumb.append(`<span class="breadcrumb-separator">></span><span class="breadcrumb-item active">${point.name}</span>`);
                
                // Add back button functionality
                if (breadcrumb.find('.breadcrumb-back').length === 0) {
                    breadcrumb.prepend('<button class="breadcrumb-back" onclick="goBackInDrilldown(\'' + chartId + '\')">← Back</button>');
                }
                
                addMessage('bot', `Drilling down into: ${point.name}. Click the back button to return to the previous level.`);
            }

            function handleChartJsDrilldown(chartId, label, index) {
                const breadcrumb = $(`#${chartId}-breadcrumb`);
                const currentBreadcrumb = breadcrumb.find('.breadcrumb-item.active').text();
                
                // Add to drilldown stack
                drilldownStack.push({
                    chartId: chartId,
                    level: currentBreadcrumb,
                    label: label,
                    index: index
                });
                
                // Update breadcrumb
                breadcrumb.find('.breadcrumb-item').removeClass('active');
                breadcrumb.append(`<span class="breadcrumb-separator">></span><span class="breadcrumb-item active">${label}</span>`);
                
                // Add back button functionality
                if (breadcrumb.find('.breadcrumb-back').length === 0) {
                    breadcrumb.prepend('<button class="breadcrumb-back" onclick="goBackInDrilldown(\'' + chartId + '\')">← Back</button>');
                }
                
                addMessage('bot', `Drilling down into: ${label}. Click the back button to return to the previous level.`);
            }

            // Global functions for chart interactions
            window.exportChart = function(chartId) {
                const chart = window[`chart_${chartId}`];
                if (chart) {
                    if (chart.exportChart) {
                        // Highcharts export
                        chart.exportChart({
                            type: 'image/png',
                            filename: `chart-${chartId}`
                        });
                    } else {
                        // Chart.js export (manual)
                        const canvas = document.getElementById(`${chartId}-canvas`);
                        if (canvas) {
                            const link = document.createElement('a');
                            link.download = `chart-${chartId}.png`;
                            link.href = canvas.toDataURL();
                            link.click();
                        }
                    }
                }
            };

            window.toggleChartFullscreen = function(chartId) {
                const container = document.getElementById(chartId);
                if (container) {
                    container.classList.toggle('chart-fullscreen');
                    
                    // Redraw chart after fullscreen toggle
                    setTimeout(() => {
                        const chart = window[`chart_${chartId}`];
                        if (chart) {
                            if (chart.reflow) {
                                chart.reflow();
                            } else {
                                chart.resize();
                            }
                        }
                    }, 100);
                }
            };

            window.goBackInDrilldown = function(chartId) {
                const stackItem = drilldownStack.pop();
                if (stackItem) {
                    const breadcrumb = $(`#${chartId}-breadcrumb`);
                    const items = breadcrumb.find('.breadcrumb-item');
                    const separators = breadcrumb.find('.breadcrumb-separator');
                    
                    if (items.length > 1) {
                        items.last().remove();
                        separators.last().remove();
                        items.eq(-2).addClass('active');
                    }
                    
                    if (items.length === 1) {
                        breadcrumb.find('.breadcrumb-back').remove();
                    }
                    
                    // Trigger chart redraw to previous level
                    const chart = window[`chart_${chartId}`];
                    if (chart && chart.drillUp) {
                        chart.drillUp();
                    }
                    
                    addMessage('bot', `Returned to: ${stackItem.level}`);
                }
            };

            function getChartTitle(chartType, query) {
                const titles = {
                    'bar': 'Bar Chart',
                    'line': 'Line Chart',
                    'pie': 'Pie Chart',
                    'scatter': 'Scatter Plot',
                    'area': 'Area Chart',
                    'treemap': 'Treemap',
                    'sunburst': 'Sunburst Chart'
                };
                
                return titles[chartType] || 'Data Visualization';
            }

            function toggleVoiceInput() {
                const $voiceBtn = $element.find('.voice-button');
                
                if (!recognition) {
                    addMessage('system', 'Voice recognition is not supported in this browser.');
                    return;
                }

                if (isListening) {
                    recognition.stop();
                    $voiceBtn.removeClass('listening');
                    isListening = false;
                } else {
                    recognition.start();
                    $voiceBtn.addClass('listening');
                    isListening = true;
                }

                recognition.onresult = function(event) {
                    const transcript = event.results[0][0].transcript;
                    $element.find('.chat-input').val(transcript);
                    $voiceBtn.removeClass('listening');
                    isListening = false;
                };

                recognition.onerror = function(event) {
                    console.error('Speech recognition error:', event.error);
                    $voiceBtn.removeClass('listening');
                    isListening = false;
                };
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
                
                let prompt = `You are ${selectedRole}, a highly skilled health insurance business analyst. Utilize the JSON data provided below after 'data:', which includes information claims data. Your primary objective is to analyze this data and answer the query asked after the data segment in query:<> format in this message. Always emphasize clarity and correctness in your answers to provide the best possible insights.`;

                const messages = [
                    {
                        role: 'system',
                        content: prompt
                    },
                    {
                        role: 'user',
                        content: `data: ${Data}\n\nquery: <${query}>`
                    }
                ];

                const requestBody = {
                    model: model,
                    messages: messages,
                    temperature: temp,
                    max_tokens: 1500,
                    top_p: 1,
                    frequency_penalty: 0,
                    presence_penalty: 0,
                    stream: false
                };

                try {
                    const response = await fetch(url, {
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

                    const result = await response.json();
                    const aiResponse = result.choices[0]?.message?.content || 'Sorry, I could not process your request.';
                    
                    hideTypingIndicator();
                    addMessage('bot', aiResponse);
                    
                } catch (error) {
                    console.error('Error calling AI API:', error);
                    hideTypingIndicator();
                    addMessage('bot', 'Sorry, I encountered an error while processing your request. Please try again.');
                }
            }

            function addMessage(sender, message) {
                const $messages = $element.find('.chat-messages');
                const timestamp = new Date().toLocaleTimeString();
                const messageId = `msg_${Date.now()}`;
                
                let messageHtml = '';
                if (sender === 'user') {
                    messageHtml = `
                        <div class="message user-message" id="${messageId}">
                            <div class="message-content">
                                <div class="message-header">
                                    <span class="user-icon">👤</span>
                                    <span class="user-name">${currentUser}</span>
                                    <span class="timestamp">${timestamp}</span>
                                </div>
                                <div class="message-text">${message}</div>
                                <div class="hear-responce user">
                                    <button class="speak-button" onclick="speakText('${messageId}')">
                                        <i class="fas fa-volume-up"></i>
                                    </button>
                                    <button class="copy-button" onclick="copyText('${messageId}')">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                } else if (sender === 'bot') {
                    messageHtml = `
                        <div class="message bot-message" id="${messageId}">
                            <div class="message-content">
                                <div class="message-header">
                                    <span class="bot-icon">🤖</span>
                                    <span class="bot-name">AI Assistant</span>
                                    <span class="timestamp">${timestamp}</span>
                                </div>
                                <div class="message-text">${message}</div>
                                <div class="hear-responce bot">
                                    <button class="speak-button" onclick="speakText('${messageId}')">
                                        <i class="fas fa-volume-up"></i>
                                    </button>
                                    <button class="copy-button" onclick="copyText('${messageId}')">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    messageHtml = `
                        <div class="message system-message">
                            <div class="message-content">
                                <div class="message-text">${message}</div>
                            </div>
                        </div>
                    `;
                }

                $messages.append(messageHtml);
                $messages.scrollTop($messages[0].scrollHeight);
                
                // Add to chat history
                chatHistory.push({
                    sender: sender,
                    message: message,
                    timestamp: timestamp
                });
            }

            function showTypingIndicator() {
                const $messages = $element.find('.chat-messages');
                const typingHtml = `
                    <div class="message typing-indicator">
                        <div class="message-content">
                            <div class="message-header">
                                <span class="bot-icon">🤖</span>
                                <span class="bot-name">AI Assistant</span>
                                <span class="timestamp">typing...</span>
                            </div>
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

            function downloadChatHistory() {
                const csvContent = "data:text/csv;charset=utf-8," + 
                    "Sender,Message,Timestamp\n" +
                    chatHistory.map(entry => 
                        `"${entry.sender}","${entry.message.replace(/"/g, '""')}","${entry.timestamp}"`
                    ).join('\n');
                
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement('a');
                link.setAttribute('href', encodedUri);
                link.setAttribute('download', `chat-history-${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            // Global functions for message interactions
            window.speakText = function(messageId) {
                const messageElement = document.getElementById(messageId);
                if (messageElement && window.speechSynthesis) {
                    const text = messageElement.querySelector('.message-text').textContent;
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.rate = 0.8;
                    utterance.pitch = 1;
                    utterance.volume = 1;
                    
                    // Highlight speak button during speech
                    const speakButton = messageElement.querySelector('.speak-button');
                    speakButton.classList.add('speack-active');
                    
                    utterance.onend = function() {
                        speakButton.classList.remove('speack-active');
                    };
                    
                    window.speechSynthesis.speak(utterance);
                }
            };

            window.copyText = function(messageId) {
                const messageElement = document.getElementById(messageId);
                if (messageElement) {
                    const text = messageElement.querySelector('.message-text').textContent;
                    navigator.clipboard.writeText(text).then(() => {
                        const copyButton = messageElement.querySelector('.copy-button');
                        copyButton.style.backgroundColor = '#4CAF50';
                        copyButton.style.color = 'white';
                        setTimeout(() => {
                            copyButton.style.backgroundColor = '';
                            copyButton.style.color = '';
                        }, 1000);
                    });
                }
            };

            // Clear all selections function
            $scope.clearAllSelections = function() {
                app.clearAll();
                addMessage('system', 'All selections have been cleared.');
            };
        }]
    };
});

