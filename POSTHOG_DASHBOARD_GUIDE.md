# PostHog Bug Reports and Error Tracking Guide

## Viewing Bug Reports in PostHog Dashboard

### 1. Bug Reports from the App

When users submit bug reports through the in-app dialog, they are captured as
PostHog events with the name `bug_report_submitted`.

**To view bug reports:**

1. Log into your PostHog dashboard at `https://us.posthog.com`
2. Navigate to **Events** in the left sidebar
3. Filter by event name: `bug_report_submitted`
4. **To see event details:** Click on any event row to expand it and view all
   properties
5. You'll see all bug reports with the following data:
   - `title` - Bug title
   - `description` - Detailed description
   - `steps_to_reproduce` - Steps to reproduce (if provided)
   - `expected_behavior` - Expected behavior (if provided)
   - `actual_behavior` - Actual behavior (if provided)
   - `priority` - Priority level (Low/Medium/High/Critical)
   - `page_url` - URL where the bug was reported
   - `user_agent` - User's browser information
   - `timestamp` - When the report was submitted
   - `user_id` - User ID (if available)
   - `images` - Array of uploaded image URLs from Supabase storage (if provided)

### 1.1. Viewing Event Properties

**In the Events view:**

- Click on any event row to expand and see all properties
- Use the "Properties" tab in the expanded view
- Properties are shown as key-value pairs

**Alternative method:**

- Go to **Live Events** for real-time event viewing
- Click on individual events to see full property details

### 2. Error Tracking and Exceptions

The application automatically captures JavaScript errors and exceptions as
PostHog events with the name `$exception`.

**To view errors:**

1. In PostHog dashboard, go to **Events**
2. Filter by event name: `$exception`
3. You'll see errors with properties like:
   - `$exception_type` - Type of error (Error, UnhandledPromiseRejection, etc.)
   - `$exception_message` - Error message
   - `$exception_stack_trace_raw` - Stack trace for debugging
   - `$exception_source` - Source file where error occurred
   - `$exception_lineno` - Line number
   - `$exception_colno` - Column number
   - `page_url` - URL where error occurred
   - `user_agent` - Browser information
   - `timestamp` - When error occurred

### 3. Setting Up Dashboards

**Create a Bug Reports Dashboard:**

1. Go to **Dashboards** in PostHog
2. Click **New Dashboard**
3. Add insights for:
   - Total bug reports over time
   - Bug reports by priority
   - Most common bug sources (by page_url)
   - Bug reports by user agent/browser

**Create an Error Tracking Dashboard:**

1. Add insights for:
   - Total errors over time
   - Errors by type
   - Most error-prone pages
   - Error trends by browser

### 4. Setting Up Alerts

**Bug Report Alerts:**

1. Go to **Alerts** in PostHog
2. Create alert for `bug_report_submitted` events
3. Set threshold (e.g., more than 5 bug reports per hour)
4. Configure notification channels (email, Slack, etc.)

**Error Alerts:**

1. Create alert for `$exception` events
2. Set threshold for critical errors
3. Filter by `$exception_type` for specific error types

## Source Maps for Better Error Tracking

The application is configured to generate source maps for production builds. To
upload source maps to PostHog for better error tracking:

### Manual Source Map Upload

1. Build your application: `npm run build`
2. Source maps will be generated in the `build` directory
3. Upload to PostHog using their API or CLI tool

### Automated Source Map Upload (Recommended)

Add to your deployment pipeline:

```bash
# Install PostHog CLI
npm install -g posthog-cli

# Upload source maps after build
posthog upload-sourcemaps \
  --api-key YOUR_POSTHOG_API_KEY \
  --project-id YOUR_PROJECT_ID \
  --source-maps-path ./build \
  --url-prefix https://your-domain.com
```

## Event Structure Reference

### Bug Report Event (`bug_report_submitted`)

```json
{
  "event": "bug_report_submitted",
  "properties": {
    "title": "Button not working",
    "description": "The submit button doesn't respond to clicks",
    "steps_to_reproduce": "1. Go to form\n2. Click submit",
    "expected_behavior": "Form should submit",
    "actual_behavior": "Nothing happens",
    "priority": "High",
    "page_url": "https://bombastic.ltd/form",
    "user_agent": "Mozilla/5.0...",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "user_id": "user_123",
    "images": ["https://storage.supabase.co/bucket/bug-reports/screenshot1.png"]
  }
}
```

## Exporting and Formatting Bug Reports

### 1. Export from PostHog

**Method 1: Manual Export**

1. Go to **Events** → Filter by `bug_report_submitted`
2. Click the **Export** button (top right)
3. Choose **CSV** or **JSON** format
4. Download the file with all event properties

**Method 2: API Export** Use PostHog's API to programmatically fetch events:

```bash
curl -X GET "https://us.posthog.com/api/projects/YOUR_PROJECT_ID/events/?event=bug_report_submitted" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 2. Formatting for Different Platforms

**For GitHub Issues:**

```markdown
## Bug Report from App

**Title:** {title} **Priority:** {priority} **Page:** {page_url} **User:**
{user_id} **Timestamp:** {timestamp}

**Description:** {description}

**Steps to Reproduce:** {steps_to_reproduce}

**Expected Behavior:** {expected_behavior}

**Actual Behavior:** {actual_behavior}

**Screenshots:** {images}

**Browser Info:** {user_agent}
```

**For Discord/Slack:**

```json
{
  "embeds": [
    {
      "title": "🐛 New Bug Report: {title}",
      "color": 15158332,
      "fields": [
        { "name": "Priority", "value": "{priority}", "inline": true },
        { "name": "Page", "value": "{page_url}", "inline": true },
        { "name": "User", "value": "{user_id}", "inline": true },
        { "name": "Description", "value": "{description}" },
        { "name": "Steps to Reproduce", "value": "{steps_to_reproduce}" },
        {
          "name": "Expected vs Actual",
          "value": "**Expected:** {expected_behavior}\n**Actual:** {actual_behavior}"
        }
      ],
      "timestamp": "{timestamp}",
      "footer": { "text": "Bombastic Bug Reporter" }
    }
  ]
}
```

**For Email:**

```html
<h2>🐛 Bug Report: {title}</h2>
<p><strong>Priority:</strong> <span style="color: red;">{priority}</span></p>
<p><strong>Page:</strong> <a href="{page_url}">{page_url}</a></p>
<p><strong>User:</strong> {user_id}</p>
<p><strong>Time:</strong> {timestamp}</p>

<h3>Description</h3>
<p>{description}</p>

<h3>Steps to Reproduce</h3>
<pre>{steps_to_reproduce}</pre>

<h3>Expected vs Actual Behavior</h3>
<p><strong>Expected:</strong> {expected_behavior}</p>
<p><strong>Actual:</strong> {actual_behavior}</p>

<h3>Screenshots</h3>
{images}

<p><small>Browser: {user_agent}</small></p>
```

### 3. Automated Integration Scripts

**Python Script for GitHub Issues:**

```python
import requests
import json
from datetime import datetime

def create_github_issue(bug_report):
    github_token = "YOUR_GITHUB_TOKEN"
    repo = "owner/repository"

    title = f"🐛 {bug_report['title']}"
    body = f"""
## Bug Report from App

**Priority:** {bug_report['priority']}
**Page:** {bug_report['page_url']}
**User:** {bug_report.get('user_id', 'Anonymous')}
**Timestamp:** {bug_report['timestamp']}

## Description
{bug_report['description']}

## Steps to Reproduce
{bug_report.get('steps_to_reproduce', 'Not provided')}

## Expected Behavior
{bug_report.get('expected_behavior', 'Not provided')}

## Actual Behavior
{bug_report.get('actual_behavior', 'Not provided')}

## Screenshots
{chr(10).join(bug_report.get('images', []))}

## Browser Info
```

{bug_report['user_agent']}

```
"""

    payload = {
        "title": title,
        "body": body,
        "labels": ["bug", f"priority-{bug_report['priority'].lower()}"]
    }

    response = requests.post(
        f"https://api.github.com/repos/{repo}/issues",
        headers={"Authorization": f"Bearer {github_token}"},
        json=payload
    )

    return response.json()
```

### Error Event (`$exception`)

```json
{
  "event": "$exception",
  "properties": {
    "$exception_type": "Error",
    "$exception_message": "Cannot read property 'click' of null",
    "$exception_stack_trace_raw": "Error: Cannot read property...\n    at submitForm...",
    "$exception_source": "https://bombastic.ltd/assets/app-abc123.js",
    "$exception_lineno": 42,
    "$exception_colno": 15,
    "page_url": "https://bombastic.ltd/form",
    "user_agent": "Mozilla/5.0...",
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

## Image Upload and Storage

### Supabase Storage Integration

Bug reports now support image uploads with secure Supabase storage integration:

**Storage Bucket:** `bug-reports`

- **Maximum file size:** 5MB per image
- **Supported formats:** JPEG, PNG, WebP, GIF
- **Maximum images:** 3 per bug report
- **Automatic compression:** Files over 1MB are compressed client-side

### Image Security and Sanitization

Images are automatically sanitized through:

1. **Client-side validation:** File type and size checking
2. **Server-side processing:** Supabase storage handles file sanitization
3. **Secure URLs:** All images are served through Supabase CDN with proper
   headers
4. **Access control:** User-specific folder structure prevents unauthorized
   access

### Storage Policies

The `bug-reports` bucket has the following security policies:

- **Upload**: Only authenticated users can upload to their own user folder
- **Read**: Public read access for viewing images in reports
- **Delete**: Users can only delete their own uploaded images
- **Admin**: Service role has full access for moderation/cleanup

### Viewing Images in Bug Reports

When viewing bug reports in PostHog:

1. Look for the `images` property in the event data
2. The `images` array contains Supabase storage URLs
3. Click URLs to view the uploaded screenshots
4. Images are automatically deleted if bug report submission fails

### Image Cleanup and Management

- **Successful submissions:** Images are kept in storage for bug analysis
- **Failed submissions:** Images are automatically cleaned up to save storage
- **User removal:** Users can remove images during report composition
- **Automatic cleanup:** Service can clean up old images as needed

### Production Scaling Options

For high-volume production environments, consider:

1. **Content Delivery Network (CDN):** Supabase already provides CDN
2. **Image optimization:** Consider additional processing for different formats
3. **Storage quotas:** Monitor Supabase storage usage and set up billing alerts
4. **Backup strategy:** Regular backups of critical bug report images

## Tips for Better Error Tracking

1. **Use Filters**: Create saved filters for different error types or pages
2. **Set Up Cohorts**: Group users who experience frequent errors
3. **Monitor Trends**: Look for spikes in errors after deployments
4. **Cross-Reference**: Compare bug reports with actual errors to validate user
   feedback
5. **User Journey**: Use session recordings to see what led to errors or bug
   reports
6. **Image Analysis**: Review uploaded screenshots to better understand user
   context

## Next Steps

1. Set up your PostHog dashboards using the guidelines above
2. Configure alerts for critical bugs and errors
3. Consider uploading source maps for better error debugging
4. Apply the Supabase storage migration to enable image uploads
5. Test the bug reporting system with image uploads
6. Regularly review and analyze the data to improve your application

## Image Upload Implementation Note

The current bug reporting system includes image upload functionality with the
following approach:

### Security and Processing

- **Client-side validation**: File type and size validation before upload
- **Image compression**: Automatic compression for files larger than 1MB
- **Base64 encoding**: Small images (under 2MB) are converted to base64 and
  included in PostHog events
- **No server-side storage**: Images are processed entirely client-side to avoid
  security risks

### Limitations and Considerations

- **Base64 approach**: Currently used for simplicity and security
- **Size limits**: Images larger than 2MB after compression are rejected
- **Production recommendations**:
  - Consider using a dedicated image service (Cloudinary, AWS S3, etc.)
  - Implement server-side image sanitization for production use
  - Add virus scanning for uploaded files
  - Use proper image storage with CDN for better performance

### Alternative Approaches for Production

1. **Cloudinary Integration**: Upload images to Cloudinary and store URLs in
   PostHog
2. **Supabase Storage**: Use existing Supabase storage buckets with proper RLS
   policies
3. **AWS S3**: Direct upload to S3 with presigned URLs
4. **Third-party services**: ImgBB, Imgur, or similar services for temporary
   storage

The current implementation prioritizes security and simplicity over advanced
features, making it suitable for internal bug reporting while avoiding the
complexity of image sanitization and storage management.
