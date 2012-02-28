var Exercise,
	player,
	track,
	curProblem,
	errors,
	curPosition;

$(function(){
	// Start the editor and canvas drawing area
	var editor = new Editor( "editor" );
	Canvas.init();
	
	$("#editor").data( "editor", editor );
	
	// Set up toolbar buttons
	$(document).buttonize();
	
	$("#play").click(function() {
		if ( Record.playing ) {
			Record.pausePlayback();
		} else {
			Record.play();
		}
	});
	
	$("#progress").slider({
		range: "min",
		value: 0,
		min: 0,
		max: 100
	});
	
	var wasDrawing,
		recordData;
	
	$(Record).bind({
		playStarted: function( e, resume ) {
			// Reset the editor and canvas to its initial state
			if ( !resume ) {
				editor.reset();
				Canvas.clear();
				Canvas.endDraw();
			}
			
			if ( wasDrawing ) {
				$(Canvas).trigger( "drawStarted" );
			}
			
			$("#overlay").show();
			
			$("#play").addClass( "ui-state-active" )
				.find( ".ui-icon" )
					.removeClass( "ui-icon-play" ).addClass( "ui-icon-pause" );
		},
		
		playStopped: function() {
			$("#overlay").hide();
			
			wasDrawing = Canvas.drawing;
			
			if ( wasDrawing ) {
				$(Canvas).trigger( "drawEnded" );
			}
			
			$("#play").removeClass( "ui-state-active" )
				.find( ".ui-icon" )
					.addClass( "ui-icon-play" ).removeClass( "ui-icon-pause" );
		}
	});
	
	$("#test").click(function() {
		var numTest = $("#tests h3").length + 1,
			testObj = { title: "Exercise #" + numTest };
		
		if ( !Record.log( testObj ) ) {
			return false;
		}
		
		insertExerciseForm( testObj );
	});
	
	$("#get-hint").bind( "buttonClick", function() {
		toggleTip( "Hint", curProblem.hints );
	});
	
	$("#show-errors").bind( "buttonClick", function() {
		toggleTip( "Error", errors, setCursor );
	});
	
	$("#show-question").bind( "buttonClick", function() {
		showTip( "Question", testAnswers, function() {
			$(".tipbar").buttonize();
			$(".tipbar input").first().focus();
		});
	});
	
	$("#next-problem").bind( "buttonClick", function() {
		var pos = Exercise.problems.indexOf( curProblem );
		
		if ( pos + 1 < Exercise.problems.length ) {
			$("#exercise-tabs").tabs( "select", pos + 1 );
		}
	});
	
	$("#results ul").delegate( "a", "click", function() {		
		var editor = $("#editor").data("editor").editor,
			search = editor.$search;
		
		search.set({ needle: $(this).text() });
		var match = search.find( editor.getSession() );
		
		if ( match && match.start ) {
			editor.moveCursorTo( match.start.row, 0 );
			editor.clearSelection();
		}
		
		return false;
	});
	
	$("#run-code").bind( "buttonClick", function() {
		var userCode = $("#editor").editorText(),
			validate = curProblem.validate,
			// TODO: Generate this list dynamically
			pass = JSHINT( "/*global input:false, inputNumber:false, print:false*/\n" + userCode ),
			hintData = JSHINT.data(),
			session = $("#editor").data( "editor" ).editor.getSession();
		
		clear();
		$("#output-nav").addClass( "ui-state-disabled" );
		$("#results .desc").empty();
		$("#results").hide();
		
		session.clearAnnotations();
		
		errors = [];
		
		var doRunTests = !!(pass && !hintData.implieds);
		
		if ( doRunTests ) {
			$("#show-errors").addClass( "ui-state-disabled" );
			hideTip( "Error" );
			
			// Run the tests
			runTests( userCode, curProblem );
			
			// Then run the user code
			clear();
			runCode( userCode );
			
			if ( outputs.length > 0 ) {
				focusOutput();
			}
		}
		
		if ( !doRunTests || errors.length ) {
			$("#show-errors").removeClass( "ui-state-disabled" );
			
	        for ( var i = 0; i < JSHINT.errors.length; i++ ) {
	            var error = JSHINT.errors[ i ];
	
	            if ( error && error.line && error.character &&
						error.reason && !/unable to continue/i.test( error.reason ) ) {

	                errors.push({
	                    row: error.line - 2,
	                    column: error.character - 1,
	                    text: error.reason,
	                    type: "error",
	                    lint: error
	                });
				}
	        }
	
			if ( hintData.implieds ) {
				for ( var i = 0; i < hintData.implieds.length; i++ ) {
					var implied = hintData.implieds[i];
					
					for ( var l = 0; l < implied.line.length; l++ ) {
						errors.push({
							row: implied.line[l] - 2,
							column: 0,
							text: "Using an undefined variable '" + implied.name + "'.",
							type: "error",
							lint: implied
						});
					}
				}
			}
			
			errors = errors.sort(function( a, b ) {
				return a.row - b.row;
			});
	
	        session.setAnnotations( errors );
	
			showTip( "Error", errors, setCursor );
			
			if ( !doRunTests ) {
				$("#results").fadeOut( 400 );
			}
		}
	});
	
	$("#editor-box-tabs")
		.tabs({
			show: function( e, ui ) {
				// If we're loading the tests tab
				if ( ui.panel.id === "tests-box" ) {
					var editor = $("#tests-editor").data( "editor" );
					
					if ( !editor ) {
						editor = new Editor( "tests-editor" );
						$("#tests-editor").data( "editor", editor );
						
						editor.editor.setReadOnly( true );
						editor.editor.setHighlightActiveLine( true );
					}
					
					$("#tests-editor").editorText( curProblem.validate );
				}
			}
		})
		.removeClass( "ui-widget ui-widget-content ui-corner-all" );
	
	$("#editor-box, #tests-box")
		.removeClass( "ui-tabs-panel ui-corner-bottom" );
	
	$("#output")
		.removeClass( "ui-corner-bottom" )
		.addClass( "ui-corner-top" );
	
	$("#editor-box-tabs-nav")
		.removeClass( "ui-corner-all" )
		.addClass( "ui-corner-bottom" )
		.find( "li" )
			.removeClass( "ui-corner-top" )
			.addClass( "ui-corner-bottom" );
	
	if ( window.location.search ) {
		getExercise( window.location.search.slice(1), openExercise );
		
	} else {
		openExerciseDialog( openExercise );
	}
});

var openExercise = function( exercise ) {
	Exercise = exercise;

	// If an audio track is provided, load the track data
	// and load the audio player as well
	if ( Exercise.audioID ) {
		connectAudio(function( data ) {
			track = data;
			SC.whenStreamingReady( audioInit );
		});
	}
	
	$("h1").text( Exercise.title );
	
	document.title = Exercise.title;
	
	/* Perhaps not necessary?
	$("<p>" + Exercise.desc + "</p>")
		.appendTo( "body" )
		.dialog({ title: Exercise.title, resizable: false, draggable: false,
			buttons: { "Start Exercise": function() { $(this).dialog("close"); } },
			close: startExercise
		});
	*/

	if ( Exercise.problems ) {
		for ( var i = 0, l = Exercise.problems.length; i < l; i++ ) {
			insertExercise( Exercise.problems[i] );
		}
	}
	
	$("#exercise-tabs")
		.append( "<div id='overlay'></div>" )
		.tabs({
			show: function( e, ui ) {
				showProblem( Exercise.problems[ ui.index ] );
			}
		})
		.removeClass( "ui-widget-content" )
		.find( "#main-tabs-nav" )
			.removeClass( "ui-corner-all" ).addClass( "ui-corner-top" )
			.find( "li:not(.ui-state-active)" ).addClass( "ui-state-disabled" ).end()
		.end();
	
	startExercise();
};

var startExercise = function() {
	$("#overlay").hide();
};

var leaveProblem = function() {
	if ( curProblem ) {
		curProblem.answer = $("#editor").editorText();
		$("#editor").extractCursor( curProblem );
	}
};

var textProblem = function() {
	if ( curProblem ) {
		var editor = $("#editor").data( "editor" ).editor;
		
		$("#editor")
			.editorText( curProblem.answer || curProblem.start || "" )
			.setCursor( curProblem );
	}
};

var showProblem = function( problem ) {	
	leaveProblem();
	
	curProblem = problem;
	errors = [];
	
	tests = [];
	testAnswers = [];
	
	// Prime the test queue
	// TODO: Should we check to see if no test() prime exists?
	if ( curProblem.validate ) {
		runCode( curProblem.validate );
	}
	
	var doAnswer = testAnswers.length > 0;
	
	$("#results").hide();
	
	$("#next-problem-desc").toggle( !!problem.done );
	
	$("#editor-box-tabs").tabs( "select", 0 );
	$("#output-nav").addClass( "ui-state-disabled" );
	$("#tests-nav").toggleClass( "ui-state-disabled",  !problem.validate || doAnswer );
	
	$("#next-problem").toggleClass( "ui-state-disabled", 
		Exercise.problems.indexOf( curProblem ) + 1 >= Exercise.problems.length );
	
	textProblem();
	
	$("#problem")
		.find( ".title" ).text( problem.title || "" ).end()
		.find( ".text" ).html( (problem.desc || "").replace( /\n/g, "<br>" ) ).end();
	
	$("#get-hint").toggleClass( "ui-state-disabled", !(problem.hints && problem.hints.length) );
	
	$("#show-errors, #run-code").toggle( !doAnswer );
	$("#show-question").toggle( doAnswer );
	
	if ( doAnswer ) {
		$("#show-question").trigger( "buttonClick" );
		
	} else {
		$("#tipbar").hide();
	}
	
	var session = $("#editor").data( "editor" ).editor.getSession();
	session.clearAnnotations();
};

var insertExercise = function( testObj ) {
	$( $("#tab-tmpl").html() )
		.find( ".ui-icon" ).remove().end()
		.find( "a" ).append( testObj.title || "Problem" ).end()
		.appendTo("#main-tabs-nav");
};

var seekTo = function( time ) {
	$("#progress").slider( "option", "value", time / 1000 );
	Record.seekTo( time );
	
	if ( typeof SC !== "undefined" ) {
		player.setPosition( time );
		player.resume();
	
	} else {
		player.seekTo( time / 1000 );
	}
};

// track.waveform_url (hot)
var audioInit = function() {
	var updateTime = true,
		wasPlaying;
	
	var updateTimeLeft = function( time ) {
		$("#timeleft").text( "-" + formatTime( (track.duration / 1000) - time ) );
	};
	
	$("#playbar").show();
	$("#progress").slider( "option", "max", track.duration / 1000 );

	Record.time = 0;

	updateTimeLeft( 0 );

	player = SC.stream( Exercise.audioID.toString(), {
		autoLoad: true,
		
		whileplaying: function() {
			if ( updateTime && Record.playing ) {
				$("#progress").slider( "option", "value", player.position / 1000 );
			}
		},
		
		onplay: Record.play,
		onresume: Record.play,
		onpause: Record.pausePlayback
	});
	
	$("#progress").slider({
		start: function() {
			updateTime = false;
			wasPlaying = Record.playing;
		},
		
		slide: function( e, ui ) {
			updateTimeLeft( ui.value );
		},
		
		change: function( e, ui ) {
			updateTimeLeft( ui.value );
		},
		
		stop: function( e, ui ) {
			updateTime = true;
			
			if ( wasPlaying ) {
				seekTo( ui.value * 1000 );
			}
		}
	});
	
	$(Record).bind({
		playStarted: function() {
			if ( player.paused ) {
				player.resume();

			} else if ( player.playState === 0 ) {
				player.play();
			}
		},
		
		playStopped: function() {
			player.pause();
		}
	});
};

Record.handlers.test = function( e ) {
	Record.pausePlayback();
	Canvas.endDraw();
	// $("#tests").accordion({ active: e.pos });
};