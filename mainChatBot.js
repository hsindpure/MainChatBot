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

    return {
        template: template,
        definition: props,
        
        controller: ['$scope', '$element', function($scope, $element,layout) {
		
		console.log($scope);
		
            const app = qlik.currApp();
			let MainData = [];
            let hypercubeData = {};
            let chatHistory = [];
            let currentUser = 'User'; // This should be fetched from QlikSense session
            let selectedRole = 'Analyst';
            let isListening = false;
            let recognition;

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
				
				console.log("reply",reply.layout.qFieldList.qItems);
                    const fields = reply.layout.qFieldList.qItems;
                    
                    fields.forEach(function(field, index) {
                        if (index < 20) { // Limit to prevent too much data
                            if (field.qCardinal < 100) { // Use as dimension if low cardinality
                                hypercubeDef.qDimensions.push({
                                    qDef: {
                                        qFieldDefs: [field.qName],
                                        qSortCriterias: [{
                                            qSortByState: 1,
                                            qSortByAscii: 1
                                        }]
                                    }
                                });
                            } else { // Use as measure if high cardinality
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
						console.log("data-layout",layout);
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
//const objects = Object_ids;


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
        return []; // No hypercube, no data
      }
  
      const totalDimensions = layout.qHyperCube.qDimensionInfo.length;
      const totalMeasures = layout.qHyperCube.qMeasureInfo.length;
      const totalColumns = totalDimensions + totalMeasures;
  
      if(totalColumns === 0) return [];
  
      const totalRows = layout.qHyperCube.qSize.qcy;
  
      const pageSize = 500; // reduced page size for safety
      const totalPages = Math.min(Math.ceil(totalRows / pageSize), 5); // limit max pages to 5 for max 2500 rows per object
  
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
  
  
  
  	/*
		var sheetID = [];
	  app.getList("sheet", function(reply){
     sheetID = [];
	  $.each(reply.qAppObjectList.qItems, function(key, value) {
	 // console.log("sheet id",value);

	  sheetID.push(value.qInfo.qId);

	 console.log("origanl sheet id",sheetID);

	  });

	  });
			var Object_ids = [];
                            var currentSheetId = qlik.navigation.getCurrentSheetId();
        
        
                            app.getAppObjectList( 'sheet', function(reply){  
                                    $.each(reply.qAppObjectList.qItems, function(key, value) {
                                       // if(currentSheetId.sheetId==value.qInfo.qId){  
                                	
                                        $.each(value.qData.cells, function(k,v){
                                    	
                                        //console.log(v);
                                    	
                                            Object_ids.push(v.name);
                                    	
                                        });
                                    //  }
        
        
                                 });
                                console.log("str",Object_ids);
                            });
							*/
                 
                   let sursa = [];
                 
                 
                 let allObjData = [];
                    myArrayObjects.forEach(function (objectID) {
                        fetchDataAndProcess(objectID).then(jsonDataArray => {
						console.log(jsonDataArray);
                            allObjData.push(jsonDataArray);

                            //console.log("all Obejcets Data", allObjData);
                            sursa = JSON.stringify(allObjData);


                            console.log("all Obejcets Data in string", sursa);
                        }).catch(error => {
                           // console.error("Error fetching and processing data:", error);
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
                addMessage('bot', `Hello! I'm your AI assistant for ${$scope.appName || 'this QlikSense app'}. How can I help you analyze your data today?`);
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
			
			 

           async function processWithAI(query) {
			//console.log("query",query);
               /* const payload = {
                    prompt: `You are a ${selectedRole} assistant for QlikSense data analysis. Analyze the provided data and answer the user's question. If the user asks for charts or tables, respond with a JSON structure that can be used to create visualizations.`,
                    data: hypercubeData,
                    query: query,
                    role: selectedRole,
                    appName: $scope.appName
                };*/
				
						MainData.push(hypercubeData);
				//console.log("data",hypercubeData);
				//console.log("role",MainData);
				
				  const decryptedKey = "openAI_Key";
 //   console.log("Decrypted Key:", decryptedKey);

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
                const temp = 0.2; // Ranges 0-2
				
				let Data = JSON.stringify(hypercubeData);
				
				   let prompt = `You are Analyst, a highly skilled health insurance business analyst. Utilize the JSON data provided below after 'data:', which includes information claims data. Your primary objective is to analyze this data and answer the query asked after the data segment in query:<> format in this message. Always emphasize clarity and correctness in your answers to provide the best possible insights.`;

            // Function to update prompt based on selected role
         
                switch (selectedRole) {
                    case 'Analyst':
                        prompt = `You are a highly skilled health insurance business analyst. Utilize the JSON data provided below after 'data:', which includes information claims data. Your primary objective is to analyze this data and answer the query asked after the data segment in query:<> format in this message. Always emphasize clarity and correctness in your answers to provide the best possible insights. response should be pointwise in use html elements`;
                        break;
                    case 'HR':
                        prompt = `You are a human resources expert. Your role is to analyze employee data and provide insights on workforce management and development. response should be pointwise in use html elements`;
                        break;
                    case 'Manager':
                        prompt = `You are a manager overseeing project operations. Your focus is on resource allocation and team performance analysis. response should be pointwise in use html elements`;
                        break;
                    case 'Executive':
                        prompt = `You are an executive responsible for strategic decision-making. Your insights should focus on high-level business analysis and growth opportunities. response should be pointwise in use html elements`;
                        break;
                    default:
                        prompt = `You are a highly skilled health insurance business analyst. Utilize the JSON data provided below after 'data:', which includes information claims data. Your primary objective is to analyze this data and answer the query asked after the data segment in query:<> format in this message. Always emphasize clarity and correctness in your answers to provide the best possible insights.  response should be pointwise in use html elements`;
                }
         
				//  let prompt = `You are a ${selectedRole}You are a highly skilled health insurance business analyst. Utilize the JSON data provided below after 'data:', which includes information claims data. Your primary objective is to analyze this data and answer the query asked after the data segment in query:<> format in this message. Always emphasize clarity and correctness in your answers to provide the best possible insights.Give me response in nice UI, when you send response in html tags just remove the html keyword from response`;
                  
				     const payload = {
                            model: model,
                            messages: [
                                {
									role: "user",
                                    content: `${prompt} data:${sursa} query:${query}`
                                }
                            ],
                            temperature: temp
                        };
						
						   const headers = {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${decryptedKey}`
                    };

						
						
                // Replace with your actual AI API endpoint
               /* $.ajax({
                    url: url, // Replace with actual endpoint
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${decryptedKey}` // Replace with actual API key
                    },
                    data: JSON.stringify(payload),
                    success: function(response) {
                        hideTypingIndicator();
                        console.log("response",response);
                        let aiResponse = response.answer || response.message || 'I apologize, but I cannot process your request at the moment.';
                        
                        // Check if response contains chart/table data
                        if (response.chart || response.table) {
                            aiResponse += '\n\n' + generateVisualization(response.chart || response.table);
                        }
                        
                        addMessage('bot', aiResponse);
                        
                        // Apply any QlikSense actions if suggested
                        if (response.qlikActions) {
                            executeQlikActions(response.qlikActions);
                        }
                    },
                    error: function() {
                        hideTypingIndicator();
                        addMessage('bot', 'I apologize, but I encountered an error processing your request. Please try again.');
                    }
                });
				
				*/
				
                    try {
                        const response = await fetch(url, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify(payload)
                        });


                        const data = await response.json();
                       
                        const output = data.choices[0].message.content;
						
						   hideTypingIndicator();
						   
                        let aiResponse = output || 'I apologize, but I cannot process your request at the moment.';
                        
						var searchTerm = "create a chart";

							if (aiResponse.includes(searchTerm)) {
								console.log("The string contains 'create a chart'.");
								 aiResponse += '\n\n' + generateVisualization(aiResponse|| aiResponse);
							} 
                        // Check if response contains chart/table data
                  
                        
                        addMessage('bot', aiResponse);
                        
                        // Apply any QlikSense actions if suggested
                        if (response.qlikActions) {
                            executeQlikActions(response.qlikActions);
                        }
          		  }
				  catch (error) {
                        if (error.message.includes('502')) {
                            console.log('Bad Gateway: The server is currently unavailable. Please try again later.', error);
                          
                        }
						
                        hideTypingIndicator();
                        addMessage('bot', 'I apologize, but I encountered an error processing your request. Please try again.');
						}
			}

            function executeQlikActions(actions) {
                actions.forEach(function(action) {
                    switch(action.type) {
                        case 'clearSelections':
                            app.clearAll();
                            break;
                        case 'selectValues':
                            app.field(action.field).selectValues(action.values);
                            break;
                        case 'selectPossible':
                            app.field(action.field).selectPossible();
                            break;
                        case 'selectAlternative':
                            app.field(action.field).selectAlternative();
                            break;
                    }
                });
            }

            function generateVisualization(data) {
                if (data.type === 'table') {
                    let html = '<div class="ai-table"><table class="data-table">';
                    
                    // Headers
                    html += '<thead><tr>';
                    data.headers.forEach(function(header) {
                        html += `<th>${header}</th>`;
                    });
                    html += '</tr></thead>';
                    
                    // Data rows
                    html += '<tbody>';
                    data.rows.forEach(function(row) {
                        html += '<tr>';
                        row.forEach(function(cell) {
                            html += `<td>${cell}</td>`;
                        });
                        html += '</tr>';
                    });
                    html += '</tbody></table></div>';
                    
                    return html;
                }
                
                return '<div class="visualization-placeholder">Chart visualization would appear here</div>';
            }

            function addMessage(type, message) {
                const $messages = $element.find('.chat-messages');
                const timestamp = new Date().toLocaleTimeString();
                
                const messageObj = {
                    type: type,
                    message: message,
                    timestamp: timestamp,
                    user: type === 'user' ? currentUser : 'AI Assistant',
                    role: selectedRole
                };
                
                chatHistory.push(messageObj);
                
				message = message.replace(/```html/g, '').replace(/```/g, '').trim();
				
				
                let messageHtml;
                if (type === 'user') {
                    messageHtml = `
                        <div class="message user-message">
                            <div class="message-content">
                                <div class="message-header">
                                    <span class="user-icon">👤</span>
                                    <span class="user-name">${currentUser}</span>
                                    <span class="timestamp">${timestamp}</span>
                                </div>
								<div class="user hear-responce">
									<button class="copy-response"><i class="fa fa-copy"></i></button>
								</div>
                                <div class="message-text">${message}</div>
							
                            </div>
                        </div>
                    `;
                } else {
                    messageHtml = `
                        <div class="message bot-message">
                            <div class="message-content">
                                <div class="message-header">
                                    <span class="bot-icon">🤖</span>
                                    <span class="bot-name">AI Assistant (${selectedRole})</span>
                                    <span class="timestamp">${timestamp}</span>
                                </div>
								<div class="hear-responce">
									<button class="speak-button"><i class="fa fa-volume-up" aria-hidden="true"></i></button>
									<button class="copy-response"><i class="fa fa-copy"></i></button>
								</div>
                                <div class="message-text">${message}</div>
							
                            </div>
                        </div>
                    `;
                }
                
                $messages.append(messageHtml);
                $messages.scrollTop($messages[0].scrollHeight);
            }

            function showTypingIndicator() {
                const $messages = $element.find('.chat-messages');
                $messages.append(`
                    <div class="message bot-message typing-indicator">
                        <div class="message-content">
                            <div class="typing-animation">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                `);
                $messages.scrollTop($messages[0].scrollHeight);
            }

            function hideTypingIndicator() {
                $element.find('.typing-indicator').remove();
            }

            function toggleVoiceInput() {
                if (!recognition) {
                    addMessage('system', 'Voice recognition is not supported in your browser.');
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
                // Create PDF content
                const pdfContent = chatHistory.map(msg => 
                    `[${msg.timestamp}] ${msg.user}: ${msg.message}`
                ).join('\n\n');

                // Create and download file
                const blob = new Blob([pdfContent], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `chatbot_history_${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

            // QlikSense Capability API functions
            $scope.clearAllSelections = function() {
                app.clearAll();
                addMessage('system', 'All selections cleared.');
            };

            $scope.getSelectionState = function() {
                app.getList('SelectionObject').then(function(reply) {
                    const selections = reply.qSelectionObject.qSelections;
                    if (selections.length > 0) {
                        const selectionText = selections.map(s => 
                            `${s.qField}: ${s.qSelected}`
                        ).join(', ');
                        addMessage('system', `Current selections: ${selectionText}`);
                    } else {
                        addMessage('system', 'No active selections.');
                    }
                });
            };
			
			
			
			
			            //response voice start code
            $(document).ready(function () {
                let isSpeaking = false;
                let speechSynthesis = window.speechSynthesis;
                let utterance;
                speechSynthesis.cancel();
                $(document).on('click','.speak-button', function () {
				var text = $(this).parent().next().text().trim();
                    if (isSpeaking) {
                        stopSpeech(this);
                    } else {
                        startSpeech(text,this);
                    }
                });

                function startSpeech(text,$this) {
                    // Get the text from the textarea
                    


                    // Check if the browser supports speech synthesis
                    if ('speechSynthesis' in window) {
                        // Create a new speech synthesis utterance
                        var utterance = new SpeechSynthesisUtterance(text);
                        isSpeaking = true;

                        // Optionally set properties like voice, pitch, and rate
                        utterance.pitch = 1; // Range: 0 to 2
                        utterance.rate = 1;  // Range: 0.1 to 10
                        utterance.volume = 1; // Range: 0 to 1

                        // Speak the text
                        window.speechSynthesis.speak(utterance);

                        $($this).html('<i class="fa fa-ban" aria-hidden="true"></i>');
                        $($this).addClass("active-speech");


                        utterance.onend = function () {
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
                $(window).on('beforeunload', function () {
                    stopSpeech();
                });
            });
			
            $(document).on("click", ".copy-response", function () {
                // Get the parent div
                const parentDiv = $(this).parent().next();

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
			


            // Initialize scope variables
            $scope.appName = 'Loading...';
        }],

        paint: function() {
            return qlik.Promise.resolve();
        }
    };
});
