#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
S3_BUCKET="s3://hl-mainnet-node-data/node_fills_by_block"
BASE_DIR="./hl-data"
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

# Function to show usage
usage() {
    echo "Usage: $0 <start_date> [target_directory]"
    echo ""
    echo "Arguments:"
    echo "  start_date        Start date in YYYYMMDD format (required)"
    echo "                    Downloads from this date through yesterday"
    echo "  target_directory  Optional directory to save data (default: ./hl-data/node_fills_by_block/hourly)"
    echo ""
    echo "Examples:"
    echo "  $0 20240115"
    echo "  $0 20240115 ./custom-data"
    exit 1
}

# Function to validate date format
validate_date() {
    local date=$1
    if [[ ! $date =~ ^[0-9]{8}$ ]]; then
        print_error "Invalid date format. Please use YYYYMMDD format."
        return 1
    fi
    
    # Try to parse the date to validate it's a real date
    if ! date -j -f "%Y%m%d" "$date" "+%Y%m%d" &>/dev/null && \
       ! date -d "$date" "+%Y%m%d" &>/dev/null; then
        print_error "Invalid date. Please provide a valid date."
        return 1
    fi
    
    return 0
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
    
    # If tools are missing, provide installation instructions
    if [ ${#missing_tools[@]} -gt 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        
        if command -v brew &> /dev/null; then
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
        elif command -v apt-get &> /dev/null; then
            print_info "Install missing tools with apt-get:"
            for tool in "${missing_tools[@]}"; do
                case $tool in
                    "aws")
                        echo "  sudo apt-get install awscli"
                        ;;
                    "lz4")
                        echo "  sudo apt-get install lz4"
                        ;;
                esac
            done
        else
            print_error "Please install missing tools manually"
        fi
        return 1
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

# Function to get yesterday's date in YYYYMMDD format
get_yesterday() {
    if date -v-1d "+%Y%m%d" &>/dev/null; then
        # macOS
        date -v-1d "+%Y%m%d"
    else
        # Linux
        date -d "yesterday" "+%Y%m%d"
    fi
}

# Function to get next date in YYYYMMDD format
get_next_date() {
    local current_date=$1
    if date -j -v+1d -f "%Y%m%d" "$current_date" "+%Y%m%d" &>/dev/null; then
        # macOS
        date -j -v+1d -f "%Y%m%d" "$current_date" "+%Y%m%d"
    else
        # Linux
        date -d "$current_date + 1 day" "+%Y%m%d"
    fi
}

# Function to download and decompress data for a single date
process_date() {
    local date=$1
    local target_dir=$2
    local date_dir="$target_dir/$date"
    
    print_status "Processing date: $date"
    
    # Build S3 path
    local s3_path="$S3_BUCKET/hourly/$date"
    
    # Create target directory for this date
    mkdir -p "$date_dir"
    
    # Download from S3
    print_info "  Downloading from S3..."
    if aws s3 sync "$s3_path" "$date_dir" --request-payer requester --quiet; then
        print_info "  ✅ Download complete"
    else
        print_warning "  ⚠️  No data found or download failed for $date"
        return 1
    fi
    
    # Count .lz4 files
    local lz4_files=$(find "$date_dir" -name "*.lz4" -type f 2>/dev/null)
    local lz4_count=$(echo "$lz4_files" | grep -c "lz4" || echo "0")
    
    if [ "$lz4_count" -eq 0 ] || [ -z "$lz4_files" ]; then
        print_info "  No .lz4 files found"
    else
        print_info "  Decompressing $lz4_count files..."
        
        if command -v parallel &> /dev/null; then
            # Use GNU parallel if available
            echo "$lz4_files" | parallel -j $DECOMPRESS_WORKERS \
                'unlz4 --rm -f {} 2>/dev/null' &>/dev/null
        else
            # Fallback to xargs for parallel processing
            echo "$lz4_files" | xargs -P $DECOMPRESS_WORKERS -I {} sh -c \
                'unlz4 --rm -f "$1" 2>/dev/null' -- {} &>/dev/null
        fi
        
        print_info "  ✅ Decompression complete"
    fi
    
    return 0
}

# Main function
main() {
    local start_time=$(date +%s)
    
    # Parse arguments
    if [ $# -lt 1 ]; then
        usage
    fi
    
    local start_date=$1
    local target_dir=${2:-"$BASE_DIR/node_fills_by_block/hourly"}
    
    print_status "🚀 Hyperliquid Data Backfill"
    print_status "============================"
    
    # Validate start date
    if ! validate_date "$start_date"; then
        exit 1
    fi
    
    # Check prerequisites
    if ! check_prerequisites; then
        print_error "Prerequisites check failed. Exiting."
        exit 1
    fi
    
    # Get yesterday's date
    local end_date=$(get_yesterday)
    
    print_info "Configuration:"
    print_info "  Start Date: $start_date"
    print_info "  End Date: $end_date (yesterday)"
    print_info "  Target Directory: $target_dir"
    print_info "  Decompression Workers: $DECOMPRESS_WORKERS"
    echo ""
    
    # Validate date range
    if [ "$start_date" -gt "$end_date" ]; then
        print_error "Start date ($start_date) is after yesterday ($end_date)"
        exit 1
    fi
    
    # Create base target directory
    mkdir -p "$target_dir"
    
    # Process each date in the range
    local current_date="$start_date"
    local total_dates=0
    local successful_dates=0
    
    while [ "$current_date" -le "$end_date" ]; do
        ((total_dates++))
        if process_date "$current_date" "$target_dir"; then
            ((successful_dates++))
        fi
        
        # Move to next date
        if [ "$current_date" = "$end_date" ]; then
            break
        fi
        current_date=$(get_next_date "$current_date")
        echo ""
    done
    
    # Calculate elapsed time
    local end_time=$(date +%s)
    local elapsed=$((end_time - start_time))
    local minutes=$((elapsed / 60))
    local seconds=$((elapsed % 60))
    
    # Show statistics
    echo ""
    print_status "============================"
    print_status "🎉 Backfill complete!"
    print_info "Dates processed: $successful_dates/$total_dates"
    print_info "Time elapsed: ${minutes}m ${seconds}s"
    
    if [ -d "$target_dir" ]; then
        local file_count=$(find "$target_dir" -type f 2>/dev/null | wc -l)
        local dir_size=$(du -sh "$target_dir" 2>/dev/null | cut -f1)
        print_info "Total files: $file_count"
        print_info "Total size: $dir_size"
        print_info "Location: $target_dir"
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

