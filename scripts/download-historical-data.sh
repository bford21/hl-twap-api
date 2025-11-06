#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BUCKETS=(
    "s3://hl-mainnet-node-data/node_trades"
    "s3://hl-mainnet-node-data/node_fills_by_block"
)

# Base directory for downloads
BASE_DIR="./hl-data"

# Number of parallel decompression workers per bucket
DECOMPRESS_WORKERS=8

# Function to print colored messages
print_status() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"
}

print_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

# Function to process a single bucket
process_bucket() {
    local bucket=$1
    local bucket_name=$(basename $bucket)
    local target_dir="$BASE_DIR/$bucket_name"
    local log_file="$BASE_DIR/${bucket_name}.log"
    
    {
        echo "[START] Processing $bucket_name at $(date)"
        
        # Create target directory
        mkdir -p "$target_dir"
        cd "$target_dir"
        
        # Download from S3
        echo "[DOWNLOAD] Starting S3 sync for $bucket_name..."
        if aws s3 sync "$bucket" ./ --request-payer requester; then
            echo "[DOWNLOAD] ✅ Complete for $bucket_name"
            
            # Count .lz4 files
            local lz4_files=$(find . -name "*.lz4" -type f)
            local lz4_count=$(echo "$lz4_files" | grep -c "lz4" || echo "0")
            
            if [ "$lz4_count" -eq 0 ] || [ -z "$lz4_files" ]; then
                echo "[INFO] No .lz4 files found in $bucket_name"
            else
                echo "[DECOMPRESS] Found $lz4_count .lz4 files"
                
                # Decompress files in parallel within this bucket
                echo "[DECOMPRESS] Starting parallel decompression with $DECOMPRESS_WORKERS workers..."
                
                if command -v parallel &> /dev/null; then
                    # Use GNU parallel if available
                    echo "$lz4_files" | parallel -j $DECOMPRESS_WORKERS --progress \
                        'unlz4 --rm -f {} 2>/dev/null && echo "✓ {}" || echo "✗ Failed: {}"'
                else
                    # Fallback to xargs for parallel processing
                    echo "$lz4_files" | xargs -P $DECOMPRESS_WORKERS -I {} sh -c \
                        'unlz4 --rm -f "$1" 2>/dev/null && echo "✓ $1" || echo "✗ Failed: $1"' -- {}
                fi
                
                echo "[DECOMPRESS] ✅ Complete for $bucket_name"
            fi
            
            # Show statistics
            local file_count=$(find . -type f | wc -l)
            local dir_size=$(du -sh . | cut -f1)
            echo "[STATS] $bucket_name: $file_count files, $dir_size total"
            
        else
            echo "[ERROR] ❌ Download failed for $bucket_name"
            return 1
        fi
        
        echo "[END] Completed $bucket_name at $(date)"
        
    } 2>&1 | tee "$log_file" | sed "s/^/[$bucket_name] /"
    
    return ${PIPESTATUS[0]}
}

# Function to check prerequisites
check_prerequisites() {
    local missing_tools=()
    
    # Check for AWS CLI
    if ! command -v aws &> /dev/null; then
        missing_tools+=("aws")
    fi
    
    # Check for unlz4
    if ! command -v unlz4 &> /dev/null; then
        missing_tools+=("lz4")
    fi
    
    # If tools are missing, try to install or provide instructions
    if [ ${#missing_tools[@]} -gt 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        
        if command -v apt-get &> /dev/null; then
            print_info "Attempting to install missing tools..."
            sudo apt-get update
            for tool in "${missing_tools[@]}"; do
                case $tool in
                    "aws")
                        print_info "Installing AWS CLI..."
                        sudo apt-get install -y awscli
                        ;;
                    "lz4")
                        print_info "Installing lz4..."
                        sudo apt-get install -y lz4
                        ;;
                esac
            done
        elif command -v brew &> /dev/null; then
            print_info "Install missing tools with Homebrew:"
            for tool in "${missing_tools[@]}"; do
                case $tool in
                    "aws")
                        echo "  brew install awscli"
                        ;;
                    "lz4")
                        echo "  brew install lz4"
                        ;;
                esac
            done
            return 1
        else
            print_error "Please install missing tools manually"
            return 1
        fi
    fi
    
    # Check for GNU parallel (optional but recommended)
    if ! command -v parallel &> /dev/null; then
        print_warning "GNU parallel not found. Using xargs for parallel processing."
        print_info "For better performance, install GNU parallel:"
        if command -v apt-get &> /dev/null; then
            print_info "  sudo apt-get install parallel"
        elif command -v brew &> /dev/null; then
            print_info "  brew install parallel"
        fi
    fi
    
    return 0
}

# Main function
main() {
    local start_time=$(date +%s)
    
    print_status "🚀 Hyperliquid Data Parallel Sync & Decompression"
    print_status "================================================"
    
    # Check prerequisites
    if ! check_prerequisites; then
        print_error "Prerequisites check failed. Exiting."
        exit 1
    fi
    
    # Create base directory
    mkdir -p "$BASE_DIR"
    
    # Show configuration
    print_info "Configuration:"
    print_info "  Base directory: $BASE_DIR"
    print_info "  Parallel decompression workers: $DECOMPRESS_WORKERS per bucket"
    print_info "  Buckets to process: ${#BUCKETS[@]}"
    for bucket in "${BUCKETS[@]}"; do
        print_info "    - $bucket"
    done
    echo ""
    
    # Start parallel processing
    print_status "Starting parallel download and processing..."
    print_status "Check individual logs in $BASE_DIR/*.log for details"
    echo ""
    
    # Process all buckets in parallel
    local pids=()
    for bucket in "${BUCKETS[@]}"; do
        process_bucket "$bucket" &
        pids+=($!)
    done
    
    # Wait for all processes and check their exit status
    local failed=0
    for i in "${!pids[@]}"; do
        if wait ${pids[$i]}; then
            print_status "✅ ${BUCKETS[$i]} completed successfully"
        else
            print_error "❌ ${BUCKETS[$i]} failed"
            ((failed++))
        fi
    done
    
    echo ""
    print_status "================================================"
    
    # Calculate elapsed time
    local end_time=$(date +%s)
    local elapsed=$((end_time - start_time))
    local minutes=$((elapsed / 60))
    local seconds=$((elapsed % 60))
    
    # Final summary
    if [ $failed -eq 0 ]; then
        print_status "🎉 All operations completed successfully!"
    else
        print_warning "⚠️  Completed with $failed bucket(s) failed"
    fi
    
    print_info "Time elapsed: ${minutes}m ${seconds}s"
    print_info "Data location: $BASE_DIR"
    
    # Show final statistics
    if [ -d "$BASE_DIR" ]; then
        echo ""
        print_info "Final Statistics:"
        local total_size=$(du -sh "$BASE_DIR" 2>/dev/null | cut -f1)
        print_info "  Total size: $total_size"
        
        for bucket in "${BUCKETS[@]}"; do
            local bucket_name=$(basename $bucket)
            local bucket_dir="$BASE_DIR/$bucket_name"
            if [ -d "$bucket_dir" ]; then
                local file_count=$(find "$bucket_dir" -type f 2>/dev/null | wc -l)
                local bucket_size=$(du -sh "$bucket_dir" 2>/dev/null | cut -f1)
                print_info "  $bucket_name: $file_count files, $bucket_size"
            fi
        done
        
        echo ""
        print_info "Logs saved to:"
        for log in "$BASE_DIR"/*.log; do
            if [ -f "$log" ]; then
                print_info "  - $log"
            fi
        done
    fi
}

# Trap to handle script interruption
cleanup() {
    print_warning "Script interrupted. Cleaning up..."
    # Kill all background jobs
    jobs -p | xargs -r kill 2>/dev/null
    exit 1
}

trap cleanup SIGINT SIGTERM

# Run the main function
main "$@"