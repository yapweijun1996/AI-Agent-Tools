'use strict';

// Fixed ceilings shared by the reader, analysis core and CLI receipt.
module.exports = Object.freeze({
  max_directory_entries: 50_000,
  max_observed_paths: 50_000,
  max_config_files: 128,
  max_files: 10_000,
  max_file_bytes: 2_097_152,
  max_input_bytes: 67_108_864,
  max_depth: 128,
  max_matching_calls: 5_000,
  max_output_bytes: 1_048_576,
  max_processing_ms: 10_000,
});
