var path = require('path');
var express = require('express');
var ws = require('ws');
var minimist = require('minimist');
var url = require('url');
var kurento = require('kurento-client');
var fs    = require('fs');
var https = require('https');
var WebSocketClient = require('websocket').w3cwebsocket;

var registerName = null;
const NOT_REGISTERED = 0;
const REGISTERING = 1;
const REGISTERED = 2;
var registerState = null
var kurentoClient = null;
var ws = new WebSocketClient('ws://139.59.4.43:8443/camera');
var ws_uri = 'ws://139.59.4.43:8888/kurento';
var remoteWebRtcEndpoint = null;
var remoteCandidates = [];

function setRegisterState(nextState) {
	registerState = nextState;
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	//console.log('Senging message: ' + jsonMessage);
	ws.send(jsonMessage);
}

function register() {
	var name = 'kms';

	setRegisterState(REGISTERING);

	var message = {
		id : 'register',
		isKMS: true,
		name : name
	};
	sendMessage(message);
}

ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
		case 'registerResponse':
			registerResponse(parsedMessage);
			break;
		case 'playCam':
			//playCam(parsedMessage, sdpOffer);
			break;
		case 'sdpOffer':
			console.log(parsedMessage);
			playCam(parsedMessage);
			break;
		case 'iceCandidate':
      console.log(parsedMessage);
      //addIceRemoteCandidate(parsedMessage.candidate);

			break;
		default:
			console.error('Unrecognized message', parsedMessage);
	}
}

function registerResponse(response){
	console.log("Response: " + JSON.stringify(response));
	var status = response.status;
	var result = response.result;
	if (status == 'error'){
		setRegisterState(NOT_REGISTERING);
		return;
	}

	if (result == 'registered'){
		setRegisterState(NOT_REGISTERING);
		return;
	}
}

function playCam(message){
	console.log("Message:" + JSON.stringify(message));
	var cam_url = message.cam_url;
	var sdpOffer = message.sdpOffer;
	getKurentoClient(function(error, kurentoClient) {
    if (error) {
      console.log("Error: Getting Kurento Client failed.");
      return;
    }
    console.log("Kurento client created.");
    kurentoClient.create('MediaPipeline', function(error, pipeline) {
      if (error) {
        console.log("Error: Creating Media Pipeline failed.");
        stop(pipeline);
        return;
      }
      
      console.log("Pipeline created.");
      pipeline.create("PlayerEndpoint", {uri: cam_url}, function(error, player){
  		  if(error) {
  			  console.log("Error: Creating PlayerEndpoint failed.");
  			  stop(pipeline);
  			  return;
  			}

  			console.log("PlayerEndpoint created.");
  			pipeline.create("WebRtcEndpoint", function(error, webRtcEndpoint){
  			  if(error) {
  			  	console.log("Error: Creating WebRtcEndpoint failed.");
  			  	stop(pipeline);
  			  	return;
  			  }

          pipeline.create("WebRtcEndpoint", function(error, webRtcPeerEndpoint){
            if(error) {
              console.log("Error: Creating WebRtcEndpoint failed.");
              stop(pipeline);
              return;
            }

            remoteWebRtcEndpoint = webRtcPeerEndpoint;
  			  	console.log("WebRtcEndpoint created.");
  			  	webRtcPeerEndpoint.processOffer(sdpOffer, function(error, sdpAnswer){
  					 if(error){
  							console.log("Error: Processing SDP Offer from peer failed.");
  			  			stop(pipeline);
  			  			return;
  						}
						  sendSdpAnswer(sdpAnswer);

              for(var i = 0; i = remoteCandidates.length; i++){
                addIceRemoteCandidate(remoteCandidates[i]);
              }

						  webRtcPeerEndpoint.gatherCandidates(function(error) {
        				if (error) {
            			console.log("Error: Gather IceCandidates failed.");
  			  				stop(pipeline);
  			  				return;
        				}

        				console.log("Gathering Ice candidates created.");
    					});
    				});

  					player.connect(webRtcEndpoint, function(error){
  						if (error) {
            		console.log("Error: Gather IceCandidates failed.");
  			  			stop(pipeline);
  			  			return;
        			}

  						console.log("PlayerEndpoint-->WebRtcEndpoint connection established");

              webRtcPeerEndpoint.connect(webRtcEndpoint, function(error){
                if (error) {
                  console.log("Error: Gather IceCandidates failed.");
                  stop(pipeline);
                  return;
                }

                console.log("webRtcPeerEndpoint-->WebRtcEndpoint connection established");

                webRtcEndpoint.connect(webRtcPeerEndpoint, function(error){
                  if (error) {
                    console.log("Error: Gather IceCandidates failed.");
                    stop(pipeline);
                    return;
                  }

                  console.log("WebRtcEndpoint --> webRtcPeerEndpoint connection established");

              
                });

                webRtcPeerEndpoint.connect(webRtcEndpoint, function(error){
                  if (error) {
                    console.log("Error: Gather IceCandidates failed.");
                    stop(pipeline);
                    return;
                  }

                  console.log("WebRtcPeerEndpoint --> webRtcEndpoint connection established");

              
                });

              });

  						player.play(function(error){
  					  	if (error) {
            			console.log("Error: Gather IceCandidates failed.");
  			  				stop(pipeline);
  			  				return;
        				}

  					  	console.log("Player playing ...");
  						});
  					});

            webRtcPeerEndpoint.on('OnIceCandidate', function(event) {
              var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
              sendIceCandidate(candidate);
            });
          });
        });
      });
	  });
  });
}


function stop(pipeline){
	if(pipeline){
		pipeline.release();
	}
}

function sendIceCandidate(candidate){
	var message = {
		id : 'iceCandidate',
		name : 'kms',
		candidate: candidate
	};
	sendMessage(message);
}

function sendSdpAnswer(sdpAnswer) {
	
	var message = {
		id : 'sdpAnswer',
		name : 'kms',
		sdpAnswer: sdpAnswer
	};
	sendMessage(message);
}


ws.onopen = function() {
    console.log('WebSocket Client Connected');
	register();
}


// Recover kurentoClient for the first time.
function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    kurento(ws_uri, function(error, _kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + ws_uri;
            return callback(message + ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function addIceRemoteCandidate(candidate){
  
  if(remoteWebRtcEndpoint){
    console.log("Adding remote Ice Candidate: " + candidate);
    remoteWebRtcEndpoint.addIceCandidate(candidate);
  }else{
    console.log("Storing remote Ice Candidate: " + candidate);
    remoteCandidates.push(candidate);
  }
}

          