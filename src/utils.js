/** @format */

/**
 * External dependencies
 */
import { find, findIndex, get } from 'lodash';
import { max as d3Max } from 'd3-array';
import { axisBottom as d3AxisBottom, axisLeft as d3AxisLeft } from 'd3-axis';
import { format as d3Format } from 'd3-format';
import {
	scaleBand as d3ScaleBand,
	scaleLinear as d3ScaleLinear,
	scaleTime as d3ScaleTime,
} from 'd3-scale';
import { event as d3Event, select as d3Select } from 'd3-selection';
import { line as d3Line } from 'd3-shape';

const dayTicksThreshold = 63;
const weekTicksThreshold = 9;
const smallBreak = 783;
const mediumBreak = 1130;
const wideBreak = 1365;
const smallPoints = 7;
const mediumPoints = 12;
const largePoints = 16;
const mostPoints = 31;

/**
 * Allows an overriding formatter or defaults to d3Format or d3TimeFormat
 * @param {string|function} format - either a format string for the D3 formatters or an overriding fomatting method
 * @param {function} formatter - default d3Format or another formatting method, which accepts the string `format`
 * @returns {function} to be used to format an input given the format and formatter
 */
export const getFormatter = ( format, formatter = d3Format ) =>
	typeof format === 'function' ? format : formatter( format );

/**
 * Describes `smallestFactor`
 * @param {number} inputNum - any double or integer
 * @returns {integer} smallest factor of num
 */
export const getFactors = inputNum => {
	const numFactors = [];
	for ( let i = 1; i <= Math.floor( Math.sqrt( inputNum ) ); i += 1 ) {
		if ( inputNum % i === 0 ) {
			numFactors.push( i );
			inputNum / i !== i && numFactors.push( inputNum / i );
		}
	}
	numFactors.sort( ( x, y ) => x - y ); // numeric sort

	return numFactors;
};

/**
 * Describes `getUniqueKeys`
 * @param {array} data - The chart component's `data` prop.
 * @returns {array} of unique category keys
 */
export const getUniqueKeys = data => {
	return [
		...new Set(
			data.reduce( ( accum, curr ) => {
				Object.keys( curr ).forEach( key => key !== 'date' && accum.push( key ) );
				return accum;
			}, [] )
		),
	];
};

/**
 * Describes `getOrderedKeys`
 * @param {array} data - The chart component's `data` prop.
 * @param {array} uniqueKeys - from `getUniqueKeys`.
 * @returns {array} of unique category keys ordered by cumulative total value
 */
export const getOrderedKeys = ( data, uniqueKeys ) =>
	uniqueKeys
		.map( key => ( {
			key,
			focus: true,
			total: data.reduce( ( a, c ) => a + c[ key ].value, 0 ),
			visible: true,
		} ) )
		.sort( ( a, b ) => b.total - a.total );

/**
 * Describes `getLineData`
 * @param {array} data - The chart component's `data` prop.
 * @param {array} orderedKeys - from `getOrderedKeys`.
 * @returns {array} an array objects with a category `key` and an array of `values` with `date` and `value` properties
 */
export const getLineData = ( data, orderedKeys ) =>
	orderedKeys.map( row => ( {
		key: row.key,
		focus: row.focus,
		visible: row.visible,
		values: data.map( d => ( {
			date: d.date,
			focus: row.focus,
			label: get( d, [ row.key, 'label' ], '' ),
			value: get( d, [ row.key, 'value' ], 0 ),
			visible: row.visible,
		} ) ),
	} ) );

/**
 * Describes `getUniqueDates`
 * @param {array} lineData - from `GetLineData`
 * @param {function} parseDate - D3 time format parser
 * @returns {array} an array of unique date values sorted from earliest to latest
 */
export const getUniqueDates = ( lineData, parseDate ) => {
	return [
		...new Set(
			lineData.reduce( ( accum, { values } ) => {
				values.forEach( ( { date } ) => accum.push( date ) );
				return accum;
			}, [] )
		),
	].sort( ( a, b ) => parseDate( a ) - parseDate( b ) );
};

export const getColor = ( key, params ) => {
	const smallColorScales = [
		[],
		[ 0.5 ],
		[ 0.333, 0.667 ],
		[ 0.2, 0.5, 0.8 ],
		[ 0.12, 0.375, 0.625, 0.88 ],
	];
	let keyValue = 0;
	const len = params.orderedKeys.length;
	const idx = findIndex( params.orderedKeys, d => d.key === key );
	if ( len < 5 ) {
		keyValue = smallColorScales[ len ][ idx ];
	} else {
		keyValue = idx / ( params.orderedKeys.length - 1 );
	}
	return params.colorScheme( keyValue );
};

/**
 * Describes getXScale
 * @param {array} uniqueDates - from `getUniqueDates`
 * @param {number} width - calculated width of the charting space
 * @returns {function} a D3 scale of the dates
 */
export const getXScale = ( uniqueDates, width ) =>
	d3ScaleBand()
		.domain( uniqueDates )
		.rangeRound( [ 0, width ] )
		.paddingInner( 0.1 );

/**
 * Describes getXGroupScale
 * @param {array} orderedKeys - from `getOrderedKeys`
 * @param {function} xScale - from `getXScale`
 * @returns {function} a D3 scale for each category within the xScale range
 */
export const getXGroupScale = ( orderedKeys, xScale ) =>
	d3ScaleBand()
		.domain( orderedKeys.filter( d => d.visible ).map( d => d.key ) )
		.rangeRound( [ 0, xScale.bandwidth() ] )
		.padding( 0.07 );

/**
 * Describes getXLineScale
 * @param {array} uniqueDates - from `getUniqueDates`
 * @param {number} width - calculated width of the charting space
 * @returns {function} a D3 scaletime for each date
 */
export const getXLineScale = ( uniqueDates, width ) =>
	d3ScaleTime()
		.domain( [ new Date( uniqueDates[ 0 ] ), new Date( uniqueDates[ uniqueDates.length - 1 ] ) ] )
		.rangeRound( [ 0, width ] );

/**
 * Describes and rounds the maximum y value to the nearest thousadn, ten-thousand, million etc.
 * @param {array} lineData - from `getLineData`
 * @returns {number} the maximum value in the timeseries multiplied by 4/3
 */
export const getYMax = lineData => {
	const yMax = 4 / 3 * d3Max( lineData, d => d3Max( d.values.map( date => date.value ) ) );
	const pow3Y = Math.pow( 10, ( ( Math.log( yMax ) * Math.LOG10E + 1 ) | 0 ) - 2 ) * 3;
	return Math.ceil( yMax / pow3Y ) * pow3Y;
};

/**
 * Describes getYScale
 * @param {number} height - calculated height of the charting space
 * @param {number} yMax - from `getYMax`
 * @returns {function} the D3 linear scale from 0 to the value from `getYMax`
 */
export const getYScale = ( height, yMax ) =>
	d3ScaleLinear()
		.domain( [ 0, yMax ] )
		.rangeRound( [ height, 0 ] );

/**
 * Describes getyTickOffset
 * @param {number} height - calculated height of the charting space
 * @param {number} yMax - from `getYMax`
 * @returns {function} the D3 linear scale from 0 to the value from `getYMax`, offset by 12 pixels down
 */
export const getYTickOffset = ( height, yMax ) =>
	d3ScaleLinear()
		.domain( [ 0, yMax ] )
		.rangeRound( [ height + 12, 12 ] );

/**
 * Describes getyTickOffset
 * @param {function} xLineScale - from `getXLineScale`.
 * @param {function} yScale - from `getYScale`.
 * @returns {function} the D3 line function for plotting all category values
 */
export const getLine = ( xLineScale, yScale ) =>
	d3Line()
		.x( d => xLineScale( new Date( d.date ) ) )
		.y( d => yScale( d.value ) );

/**
 * Calculate the maximum number of ticks allowed in the x-axis based on the width and mode of the chart
 * @param {integer} width - calculated page width
 * @param {string} mode - item-comparison or time-comparison
 * @returns {integer} number of x-axis ticks based on width and chart mode
 */
export const calculateMaxXTicks = ( width, mode ) => {
	if ( width < smallBreak ) {
		return smallPoints;
	} else if ( width >= smallBreak && width <= mediumBreak ) {
		return mediumPoints;
	} else if ( width > mediumBreak && width <= wideBreak ) {
		if ( mode === 'time-comparison' ) {
			return largePoints;
		} else if ( mode === 'item-comparison' ) {
			return mediumPoints;
		}
	} else if ( width > wideBreak ) {
		if ( mode === 'time-comparison' ) {
			return mostPoints;
		} else if ( mode === 'item-comparison' ) {
			return largePoints;
		}
	}

	return largePoints;
};

/**
 * Filter out irrelevant dates so only the first date of each month is kept.
 * @param {array} dates - string dates.
 * @returns {array} Filtered dates.
 */
export const getFirstDatePerMonth = dates => {
	return dates.filter(
		( date, i ) => i === 0 || new Date( date ).getMonth() !== new Date( dates[ i - 1 ] ).getMonth()
	);
};

/**
 * Get x-axis ticks given the unique dates and the increment factor.
 * @param {array} uniqueDates - all the unique dates from the input data for the chart
 * @param {integer} incrementFactor - increment factor for the visible ticks.
 * @returns {array} Ticks for the x-axis.
 */
export const getXTicksFromIncrementFactor = ( uniqueDates, incrementFactor ) => {
	const ticks = [];

	for ( let idx = 0; idx < uniqueDates.length; idx = idx + incrementFactor ) {
		ticks.push( uniqueDates[ idx ] );
	}

	// If the first date is missing from the ticks array, add it back in.
	if ( ticks[ 0 ] !== uniqueDates[ 0 ] ) {
		ticks.unshift( uniqueDates[ 0 ] );
	}

	return ticks;
};

/**
 * Calculates the increment factor between ticks so there aren't more than maxTicks.
 * @param {array} uniqueDates - all the unique dates from the input data for the chart
 * @param {integer} maxTicks - maximum number of ticks that can be displayed in the x-axis
 * @returns {integer} x-axis ticks increment factor
 */
export const calculateXTicksIncrementFactor = ( uniqueDates, maxTicks ) => {
	let factors = [];
	let i = 1;
	// First we get all the factors of the length of the uniqueDates array
	// if the number is a prime number or near prime (with 3 factors) then we
	// step down by 1 integer and try again.
	while ( factors.length <= 3 ) {
		factors = getFactors( uniqueDates.length - i );
		i += 1;
	}

	return factors.find( f => uniqueDates.length / f < maxTicks );
};

/**
 * Returns ticks for the x-axis.
 * @param {array} uniqueDates - all the unique dates from the input data for the chart
 * @param {integer} width - calculated page width
 * @param {string} mode - item-comparison or time-comparison
 * @param {string} interval - string of the interval used in the graph (hour, day, week...)
 * @returns {integer} number of x-axis ticks based on width and chart mode
 */
export const getXTicks = ( uniqueDates, width, mode, interval ) => {
	const maxTicks = calculateMaxXTicks( width, mode );

	if (
		( uniqueDates.length >= dayTicksThreshold && interval === 'day' ) ||
		( uniqueDates.length >= weekTicksThreshold && interval === 'week' )
	) {
		uniqueDates = getFirstDatePerMonth( uniqueDates );
	}
	if ( uniqueDates.length <= maxTicks ) {
		return uniqueDates;
	}

	const incrementFactor = calculateXTicksIncrementFactor( uniqueDates, maxTicks );

	return getXTicksFromIncrementFactor( uniqueDates, incrementFactor );
};

/**
 * Describes getDateSpaces
 * @param {array} data - The chart component's `data` prop.
 * @param {array} uniqueDates - from `getUniqueDates`
 * @param {number} width - calculated width of the charting space
 * @param {function} xLineScale - from `getXLineScale`
 * @returns {array} that icnludes the date, start (x position) and width to mode the mouseover rectangles
 */
export const getDateSpaces = ( data, uniqueDates, width, xLineScale ) =>
	uniqueDates.map( ( d, i ) => {
		const datapoints = find( data, { date: d } );
		const xNow = xLineScale( new Date( d ) );
		const xPrev =
			i >= 1
				? xLineScale( new Date( uniqueDates[ i - 1 ] ) )
				: xLineScale( new Date( uniqueDates[ 0 ] ) );
		const xNext =
			i < uniqueDates.length - 1
				? xLineScale( new Date( uniqueDates[ i + 1 ] ) )
				: xLineScale( new Date( uniqueDates[ uniqueDates.length - 1 ] ) );
		let xWidth = i === 0 ? xNext - xNow : xNow - xPrev;
		const xStart = i === 0 ? 0 : xNow - xWidth / 2;
		xWidth = i === 0 || i === uniqueDates.length - 1 ? xWidth / 2 : xWidth;
		return {
			date: d,
			start: uniqueDates.length > 1 ? xStart : 0,
			width: uniqueDates.length > 1 ? xWidth : width,
			values: Object.keys( datapoints )
				.filter( key => key !== 'date' )
				.map( key => {
					return {
						key,
						value: datapoints[ key ].value,
						date: d,
					};
				} ),
		};
	} );

/**
 * Compares 2 strings and returns a list of words that are unique from s2
 * @param {string} s1 - base string to compare against
 * @param {string} s2 - string to compare against the base string
 * @param {string} splitChar - character to use to deliminate words
 * @returns {array} of unique words that appear in s2 but not in s1, the base string
 */
export const compareStrings = ( s1, s2, splitChar = ' ' ) => {
	const string1 = s1.split( splitChar );
	const string2 = s2.split( splitChar );
	const diff = new Array();
	const long = s1.length > s2.length ? string1 : string2;
	for ( let x = 0; x < long.length; x++ ) {
		string1[ x ] !== string2[ x ] && diff.push( string2[ x ] );
	}
	return diff;
};

export const drawAxis = ( node, params ) => {
	const xScale = params.type === 'line' ? params.xLineScale : params.xScale;
	const removeDuplicateDates = ( d, i, ticks, formatter ) => {
		const monthDate = d instanceof Date ? d : new Date( d );
		let prevMonth = i !== 0 ? ticks[ i - 1 ] : ticks[ i ];
		prevMonth = prevMonth instanceof Date ? prevMonth : new Date( prevMonth );
		return i === 0
			? formatter( monthDate )
			: compareStrings( formatter( prevMonth ), formatter( monthDate ) ).join( ' ' );
	};

	const yGrids = [];
	for ( let i = 0; i < 4; i++ ) {
		yGrids.push( i / 3 * params.yMax );
	}

	const ticks = params.xTicks.map( d => ( params.type === 'line' ? new Date( d ) : d ) );

	node
		.append( 'g' )
		.attr( 'class', 'axis' )
		.attr( 'aria-hidden', 'true' )
		.attr( 'transform', `translate(0, ${ params.height })` )
		.call(
			d3AxisBottom( xScale )
				.tickValues( ticks )
				.tickFormat( ( d, i ) => removeDuplicateDates( d, i, ticks, params.xFormat ) )
		);

	node
		.append( 'g' )
		.attr( 'class', 'axis axis-month' )
		.attr( 'aria-hidden', 'true' )
		.attr( 'transform', `translate(0, ${ params.height + 20 })` )
		.call(
			d3AxisBottom( xScale )
				.tickValues( ticks )
				.tickFormat( ( d, i ) => removeDuplicateDates( d, i, ticks, params.x2Format ) )
		)
		.call( g => g.select( '.domain' ).remove() );

	node
		.append( 'g' )
		.attr( 'class', 'pipes' )
		.attr( 'transform', `translate(0, ${ params.height })` )
		.call(
			d3AxisBottom( xScale )
				.tickValues( ticks )
				.tickSize( 5 )
				.tickFormat( '' )
		);

	node
		.append( 'g' )
		.attr( 'class', 'grid' )
		.attr( 'transform', `translate(-${ params.margin.left },0)` )
		.call(
			d3AxisLeft( params.yScale )
				.tickValues( yGrids )
				.tickSize( -params.width - params.margin.left - params.margin.right )
				.tickFormat( '' )
		)
		.call( g => g.select( '.domain' ).remove() );

	node
		.append( 'g' )
		.attr( 'class', 'axis y-axis' )
		.attr( 'aria-hidden', 'true' )
		.attr( 'transform', 'translate(-50, 0)' )
		.attr( 'text-anchor', 'start' )
		.call(
			d3AxisLeft( params.yTickOffset )
				.tickValues( yGrids )
				.tickFormat( d => params.yFormat( d !== 0 ? d : 0 ) )
		);

	node.selectAll( '.domain' ).remove();
	node
		.selectAll( '.axis' )
		.selectAll( '.tick' )
		.select( 'line' )
		.remove();
};

const getTooltipRowLabel = ( d, row, params ) => {
	if ( d[ row.key ].labelDate ) {
		return params.tooltipLabelFormat(
			d[ row.key ].labelDate instanceof Date
				? d[ row.key ].labelDate
				: new Date( d[ row.key ].labelDate )
		);
	}
	return row.key;
};

const showTooltip = ( params, d, position ) => {
	const keys = params.orderedKeys.filter( row => row.visible ).map(
		row => `
				<li class="key-row">
					<div class="key-container">
						<span class="key-color" style="background-color:${ getColor( row.key, params ) }"></span>
						<span class="key-key">${ getTooltipRowLabel( d, row, params ) }</span>
					</div>
					<span class="key-value">${ params.tooltipValueFormat( d[ row.key ].value ) }</span>
				</li>
			`
	);

	const tooltipTitle = params.tooltipTitle
		? params.tooltipTitle
		: params.tooltipLabelFormat( d.date instanceof Date ? d.date : new Date( d.date ) );

	params.tooltip
		.style( 'left', position.x + 'px' )
		.style( 'top', position.y + 'px' )
		.style( 'visibility', 'visible' ).html( `
			<div>
				<h4>${ tooltipTitle }</h4>
				<ul>
				${ keys.join( '' ) }
				</ul>
			</div>
		` );
};

const handleMouseOverBarChart = ( date, parentNode, node, data, params, position ) => {
	d3Select( parentNode )
		.select( '.barfocus' )
		.attr( 'opacity', '0.1' );
	showTooltip( params, data.find( e => e.date === date ), position );
};

const handleMouseOutBarChart = ( parentNode, params ) => {
	d3Select( parentNode )
		.select( '.barfocus' )
		.attr( 'opacity', '0' );
	params.tooltip.style( 'visibility', 'hidden' );
};

const handleMouseOverLineChart = ( date, parentNode, node, data, params, position ) => {
	d3Select( parentNode )
		.select( '.focus-grid' )
		.attr( 'opacity', '1' );
	showTooltip( params, data.find( e => e.date === date ), position );
};

const handleMouseOutLineChart = ( parentNode, params ) => {
	d3Select( parentNode )
		.select( '.focus-grid' )
		.attr( 'opacity', '0' );
	params.tooltip.style( 'visibility', 'hidden' );
};

const calculateTooltipXPosition = (
	elementCoords,
	chartCoords,
	tooltipSize,
	tooltipMargin,
	elementWidthRatio,
	tooltipPosition
) => {
	const xPosition =
		elementCoords.left + elementCoords.width * elementWidthRatio + tooltipMargin - chartCoords.left;

	if ( tooltipPosition === 'below' ) {
		return Math.max(
			tooltipMargin,
			Math.min(
				xPosition - tooltipSize.width / 2,
				chartCoords.width - tooltipSize.width - tooltipMargin
			)
		);
	}

	if ( xPosition + tooltipSize.width + tooltipMargin > chartCoords.width ) {
		return Math.max(
			tooltipMargin,
			elementCoords.left +
				elementCoords.width * ( 1 - elementWidthRatio ) -
				tooltipSize.width -
				tooltipMargin -
				chartCoords.left
		);
	}

	return xPosition;
};

const calculateTooltipYPosition = (
	elementCoords,
	chartCoords,
	tooltipSize,
	tooltipMargin,
	tooltipPosition
) => {
	if ( tooltipPosition === 'below' ) {
		return chartCoords.height;
	}

	const yPosition = elementCoords.top + tooltipMargin - chartCoords.top;
	if ( yPosition + tooltipSize.height + tooltipMargin > chartCoords.height ) {
		return Math.max( 0, elementCoords.top - tooltipSize.height - tooltipMargin - chartCoords.top );
	}

	return yPosition;
};

const calculateTooltipPosition = ( element, chart, tooltipPosition, elementWidthRatio = 1 ) => {
	const elementCoords = element.getBoundingClientRect();
	const chartCoords = chart.getBoundingClientRect();
	const tooltipSize = d3Select( '.d3-chart__tooltip' )
		.node()
		.getBoundingClientRect();
	const tooltipMargin = 24;

	if ( tooltipPosition === 'below' ) {
		elementWidthRatio = 0;
	}

	return {
		x: calculateTooltipXPosition(
			elementCoords,
			chartCoords,
			tooltipSize,
			tooltipMargin,
			elementWidthRatio,
			tooltipPosition
		),
		y: calculateTooltipYPosition(
			elementCoords,
			chartCoords,
			tooltipSize,
			tooltipMargin,
			tooltipPosition
		),
	};
};

export const drawLines = ( node, data, params ) => {
	const series = node
		.append( 'g' )
		.attr( 'class', 'lines' )
		.selectAll( '.line-g' )
		.data( params.lineData.filter( d => d.visible ).reverse() )
		.enter()
		.append( 'g' )
		.attr( 'class', 'line-g' )
		.attr( 'role', 'region' )
		.attr( 'aria-label', d => d.key );

	let lineStroke = params.width <= wideBreak || params.uniqueDates.length > 50 ? 2 : 3;
	lineStroke = params.width <= smallBreak ? 1.25 : lineStroke;
	const dotRadius = params.width <= wideBreak ? 4 : 6;

	series
		.append( 'path' )
		.attr( 'fill', 'none' )
		.attr( 'stroke-width', lineStroke )
		.attr( 'stroke-linejoin', 'round' )
		.attr( 'stroke-linecap', 'round' )
		.attr( 'stroke', d => getColor( d.key, params ) )
		.style( 'opacity', d => {
			const opacity = d.focus ? 1 : 0.1;
			return d.visible ? opacity : 0;
		} )
		.attr( 'd', d => params.line( d.values ) );

	const minDataPointSpacing = 36;

	params.width / params.uniqueDates.length > minDataPointSpacing &&
		series
			.selectAll( 'circle' )
			.data( ( d, i ) => d.values.map( row => ( { ...row, i, visible: d.visible, key: d.key } ) ) )
			.enter()
			.append( 'circle' )
			.attr( 'r', dotRadius )
			.attr( 'fill', d => getColor( d.key, params ) )
			.attr( 'stroke', '#fff' )
			.attr( 'stroke-width', lineStroke + 1 )
			.style( 'opacity', d => {
				const opacity = d.focus ? 1 : 0.1;
				return d.visible ? opacity : 0;
			} )
			.attr( 'cx', d => params.xLineScale( new Date( d.date ) ) )
			.attr( 'cy', d => params.yScale( d.value ) )
			.attr( 'tabindex', '0' )
			.attr( 'aria-label', d => {
				const label = d.label
					? d.label
					: params.tooltipLabelFormat( d.date instanceof Date ? d.date : new Date( d.date ) );
				return `${ label } ${ params.tooltipValueFormat( d.value ) }`;
			} )
			.on( 'focus', ( d, i, nodes ) => {
				const position = calculateTooltipPosition(
					d3Event.target,
					node.node(),
					params.tooltipPosition
				);
				handleMouseOverLineChart( d.date, nodes[ i ].parentNode, node, data, params, position );
			} )
			.on( 'blur', ( d, i, nodes ) => handleMouseOutLineChart( nodes[ i ].parentNode, params ) );

	const focus = node
		.append( 'g' )
		.attr( 'class', 'focusspaces' )
		.selectAll( '.focus' )
		.data( params.dateSpaces )
		.enter()
		.append( 'g' )
		.attr( 'class', 'focus' );

	const focusGrid = focus
		.append( 'g' )
		.attr( 'class', 'focus-grid' )
		.attr( 'opacity', '0' );

	focusGrid
		.append( 'line' )
		.attr( 'x1', d => params.xLineScale( new Date( d.date ) ) )
		.attr( 'y1', 0 )
		.attr( 'x2', d => params.xLineScale( new Date( d.date ) ) )
		.attr( 'y2', params.height );

	focusGrid
		.selectAll( 'circle' )
		.data( d => d.values.reverse() )
		.enter()
		.append( 'circle' )
		.attr( 'r', dotRadius + 2 )
		.attr( 'fill', d => getColor( d.key, params ) )
		.attr( 'stroke', '#fff' )
		.attr( 'stroke-width', lineStroke + 2 )
		.attr( 'cx', d => params.xLineScale( new Date( d.date ) ) )
		.attr( 'cy', d => params.yScale( d.value ) );

	focus
		.append( 'rect' )
		.attr( 'class', 'focus-g' )
		.attr( 'x', d => d.start )
		.attr( 'y', 0 )
		.attr( 'width', d => d.width )
		.attr( 'height', params.height )
		.attr( 'opacity', 0 )
		.on( 'mouseover', ( d, i, nodes ) => {
			const elementWidthRatio = i === 0 || i === params.dateSpaces.length - 1 ? 0 : 0.5;
			const position = calculateTooltipPosition(
				d3Event.target,
				node.node(),
				params.tooltipPosition,
				elementWidthRatio
			);
			handleMouseOverLineChart( d.date, nodes[ i ].parentNode, node, data, params, position );
		} )
		.on( 'mouseout', ( d, i, nodes ) => handleMouseOutLineChart( nodes[ i ].parentNode, params ) );
};

export const drawBars = ( node, data, params ) => {
	const barGroup = node
		.append( 'g' )
		.attr( 'class', 'bars' )
		.selectAll( 'g' )
		.data( data )
		.enter()
		.append( 'g' )
		.attr( 'transform', d => `translate(${ params.xScale( d.date ) },0)` )
		.attr( 'class', 'bargroup' )
		.attr( 'role', 'region' )
		.attr(
			'aria-label',
			d =>
				params.mode === 'item-comparison'
					? params.tooltipLabelFormat( d.date instanceof Date ? d.date : new Date( d.date ) )
					: null
		);

	barGroup
		.append( 'rect' )
		.attr( 'class', 'barfocus' )
		.attr( 'x', 0 )
		.attr( 'y', 0 )
		.attr( 'width', params.xGroupScale.range()[ 1 ] )
		.attr( 'height', params.height )
		.attr( 'opacity', '0' );

	barGroup
		.selectAll( '.bar' )
		.data( d =>
			params.orderedKeys.filter( row => row.visible ).map( row => ( {
				key: row.key,
				focus: row.focus,
				value: get( d, [ row.key, 'value' ], 0 ),
				label: get( d, [ row.key, 'label' ], '' ),
				visible: row.visible,
				date: d.date,
			} ) )
		)
		.enter()
		.append( 'rect' )
		.attr( 'class', 'bar' )
		.attr( 'x', d => params.xGroupScale( d.key ) )
		.attr( 'y', d => params.yScale( d.value ) )
		.attr( 'width', params.xGroupScale.bandwidth() )
		.attr( 'height', d => params.height - params.yScale( d.value ) )
		.attr( 'fill', d => getColor( d.key, params ) )
		.attr( 'tabindex', '0' )
		.attr( 'aria-label', d => {
			const label = params.mode === 'time-comparison' && d.label ? d.label : d.key;
			return `${ label } ${ params.tooltipValueFormat( d.value ) }`;
		} )
		.style( 'opacity', d => {
			const opacity = d.focus ? 1 : 0.1;
			return d.visible ? opacity : 0;
		} )
		.on( 'focus', ( d, i, nodes ) => {
			const targetNode = d.value > 0 ? d3Event.target : d3Event.target.parentNode;
			const position = calculateTooltipPosition( targetNode, node.node(), params.tooltipPosition );
			handleMouseOverBarChart( d.date, nodes[ i ].parentNode, node, data, params, position );
		} )
		.on( 'blur', ( d, i, nodes ) => handleMouseOutBarChart( nodes[ i ].parentNode, params ) );

	barGroup
		.append( 'rect' )
		.attr( 'class', 'barmouse' )
		.attr( 'x', 0 )
		.attr( 'y', 0 )
		.attr( 'width', params.xGroupScale.range()[ 1 ] )
		.attr( 'height', params.height )
		.attr( 'opacity', '0' )
		.on( 'mouseover', ( d, i, nodes ) => {
			const position = calculateTooltipPosition(
				d3Event.target,
				node.node(),
				params.tooltipPosition
			);
			handleMouseOverBarChart( d.date, nodes[ i ].parentNode, node, data, params, position );
		} )
		.on( 'mouseout', ( d, i, nodes ) => handleMouseOutBarChart( nodes[ i ].parentNode, params ) );
};
