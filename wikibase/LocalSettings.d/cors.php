<?php
/**
 * CORS configuration for FOVEA frontend access.
 *
 * This file enables Cross-Origin Resource Sharing (CORS) so that the FOVEA
 * frontend can access the Wikibase API from a different origin.
 */

// Enable CORS for all origins (adjust for production)
$wgCrossSiteAJAXdomains = ['*'];

// Allow credentials in CORS requests
$wgAllowCrossOrigin = true;

// Set CORS headers for API requests
$wgCORSHeaders = [
    'Access-Control-Allow-Origin' => '*',
    'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers' => 'Content-Type, Authorization, X-Requested-With',
];

// Disable session cookies for anonymous API access
$wgEnableAPI = true;
$wgEnableWriteAPI = true;

// Allow JSON format with callback for JSONP
$wgAllowJsonP = true;
