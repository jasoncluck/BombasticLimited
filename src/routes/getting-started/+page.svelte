<script lang="ts">
  import { Markdown } from '$lib/components/ui/markdown/index.js';

  const gettingStartedContent = `# Getting Started with Bombastic

Welcome to **Bombastic**, your ultimate media management and discovery platform! This guide will help you get up and running quickly and make the most of all the features available.

## 🚀 Quick Start

Bombastic is designed to help you organize, discover, and enjoy your favorite videos and playlists. Whether you're managing content from YouTube, Twitch, or other platforms, we've got you covered.

### First Steps

1. **Create an Account**: Sign up to unlock personalized features and save your preferences
2. **Explore Content**: Browse through curated playlists and discover new videos
3. **Organize**: Create your own playlists and organize content the way you like
4. **Customize**: Adjust settings to match your viewing preferences

## 📋 Key Features

### Content Discovery
- **Smart Search**: Find videos and playlists quickly with our advanced search functionality
- **Category Browsing**: Explore content organized by topics and genres
- **Trending Content**: Stay up-to-date with what's popular right now
- **Recommendations**: Get personalized suggestions based on your viewing history

### Playlist Management
- **Create Playlists**: Organize your favorite videos into custom playlists
- **Share Playlists**: Share your curated collections with friends and community
- **Collaborative Playlists**: Work together with others to build amazing collections
- **Import/Export**: Bring in playlists from other platforms

### Media Player
- **Universal Player**: Watch videos from multiple platforms in one place
- **Quality Controls**: Choose your preferred video quality and playback settings
- **Fullscreen Mode**: Enjoy an immersive viewing experience
- **Keyboard Shortcuts**: Navigate efficiently with hotkeys

### User Experience
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Dark/Light Mode**: Choose the theme that's comfortable for your eyes
- **Customizable Layout**: Arrange the interface to match your workflow
- **Offline Access**: Save content for viewing when you're not connected

## 🎯 Getting the Most Out of Bombastic

### For Content Creators
- **Upload and Organize**: Manage your content library efficiently
- **Analytics**: Track performance and engagement metrics
- **Community Features**: Connect with your audience through comments and feedback
- **Monetization Tools**: Explore options for content monetization

### For Content Consumers
- **Watchlists**: Keep track of videos you want to watch later
- **Progress Tracking**: Resume videos where you left off
- **Social Features**: Follow creators and interact with the community
- **Notifications**: Stay updated on new content from your favorite creators

### For Teams and Organizations
- **Collaborative Workspaces**: Share and organize content with team members
- **Access Controls**: Manage permissions and privacy settings
- **Bulk Operations**: Efficiently manage large collections of content
- **Integration Options**: Connect with your existing tools and workflows

## 🛠️ Advanced Features

### Search and Filtering
Learn to use advanced search operators to find exactly what you're looking for:
- Use quotes for exact phrases: \`"specific title"\`
- Filter by duration: \`duration:>10min\`
- Search within descriptions: \`description:keyword\`
- Combine filters: \`creator:username duration:<5min\`

### Keyboard Shortcuts
Master these shortcuts to navigate like a pro:
- \`Space\`: Play/Pause
- \`F\`: Toggle fullscreen
- \`M\`: Mute/Unmute
- \`→/←\`: Skip forward/backward
- \`↑/↓\`: Volume up/down
- \`/\`: Focus search box
- \`Esc\`: Close modals/exit fullscreen

### Customization Options
Personalize your experience:
- **Theme Settings**: Choose from multiple color schemes
- **Layout Preferences**: Adjust sidebar position and content layout
- **Autoplay Settings**: Control when videos play automatically
- **Notification Preferences**: Choose what updates you want to receive

## 🔧 Settings and Preferences

### Account Settings
- **Profile Information**: Update your display name, avatar, and bio
- **Privacy Controls**: Manage who can see your activity and playlists
- **Email Preferences**: Control notification frequency and types
- **Connected Accounts**: Link accounts from other platforms

### Playback Settings
- **Default Quality**: Set your preferred video quality
- **Autoplay**: Configure automatic video playback
- **Captions**: Enable and customize subtitle display
- **Speed Controls**: Set default playback speed

### Interface Settings
- **Language**: Choose your preferred language
- **Time Zone**: Set your local time zone for accurate timestamps
- **Accessibility**: Enable features for better accessibility
- **Performance**: Optimize settings for your device

## 🤝 Community and Support

### Getting Help
- **Documentation**: Comprehensive guides and tutorials
- **FAQ**: Answers to common questions
- **Support Chat**: Real-time help when you need it
- **Community Forums**: Connect with other users and share tips

### Contributing
- **Feature Requests**: Suggest improvements and new features
- **Bug Reports**: Help us identify and fix issues
- **Beta Testing**: Try out new features before they're released
- **Content Guidelines**: Learn about our community standards

### Staying Connected
- **Newsletter**: Get updates on new features and content
- **Social Media**: Follow us for tips, updates, and community highlights
- **Release Notes**: Stay informed about what's new in each update
- **Developer API**: Integrate Bombastic with your own applications

## 🚨 Tips for Success

### Best Practices
1. **Organize Early**: Set up your folder structure and naming conventions from the start
2. **Use Tags**: Tag your content consistently for easy discovery later
3. **Regular Cleanup**: Periodically review and organize your saved content
4. **Backup Important Data**: Export your playlists and important content regularly

### Common Pitfalls to Avoid
- Don't ignore privacy settings - review them regularly
- Avoid creating too many similar playlists - consolidate when possible
- Don't skip the tutorial videos - they contain valuable tips
- Remember to check for updates regularly for the best experience

### Performance Optimization
- Close unused tabs to free up memory
- Use keyboard shortcuts for faster navigation
- Enable hardware acceleration if available
- Consider your internet connection quality when setting video quality preferences

## 📱 Mobile Experience

Bombastic works great on mobile devices! Here are some mobile-specific tips:

- **Touch Gestures**: Swipe to navigate between videos
- **Offline Mode**: Download content for viewing without internet
- **Battery Optimization**: Adjust settings to conserve battery life
- **Picture-in-Picture**: Continue watching while using other apps

## 🔐 Privacy and Security

Your privacy and security are important to us:

- **Data Encryption**: All your data is encrypted in transit and at rest
- **Privacy Controls**: You control who can see your activity and content
- **Secure Authentication**: Multi-factor authentication available
- **Regular Audits**: We regularly review and update our security practices

## 🎉 What's Next?

Now that you're familiar with the basics, here are some next steps:

1. **Explore the Interface**: Take some time to click around and get familiar
2. **Create Your First Playlist**: Start organizing content that interests you
3. **Customize Your Settings**: Make Bombastic work the way you want it to
4. **Join the Community**: Connect with other users and share your experiences
5. **Stay Updated**: Follow our release notes and blog for new features

---

**Ready to get started?** Jump right in and begin exploring! If you have any questions, our support team is always here to help.

*Last updated: December 2024*`;
</script>

<div class="getting-started-page">
  <!-- Header -->
  <header class="border-b border-border pb-6 mb-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
      <div>
        <h1 class="text-4xl font-bold text-foreground mb-2">Getting Started</h1>
        <p class="text-muted-foreground text-lg">
          Everything you need to know to master Bombastic
        </p>
      </div>
      
      <div class="flex gap-2">
        <a 
          href="/" 
          class="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          ← Back to App
        </a>
      </div>
    </div>
  </header>

  <!-- Table of Contents -->
  <aside class="bg-muted/30 rounded-lg p-6 mb-8">
    <h2 class="text-xl font-semibold mb-4 text-foreground">Table of Contents</h2>
    <nav class="space-y-2">
      <a href="#quick-start" class="block text-primary hover:text-primary/80 transition-colors">🚀 Quick Start</a>
      <a href="#key-features" class="block text-primary hover:text-primary/80 transition-colors">📋 Key Features</a>
      <a href="#getting-the-most" class="block text-primary hover:text-primary/80 transition-colors">🎯 Getting the Most Out of Bombastic</a>
      <a href="#advanced-features" class="block text-primary hover:text-primary/80 transition-colors">🛠️ Advanced Features</a>
      <a href="#settings" class="block text-primary hover:text-primary/80 transition-colors">🔧 Settings and Preferences</a>
      <a href="#community" class="block text-primary hover:text-primary/80 transition-colors">🤝 Community and Support</a>
      <a href="#tips" class="block text-primary hover:text-primary/80 transition-colors">🚨 Tips for Success</a>
      <a href="#mobile" class="block text-primary hover:text-primary/80 transition-colors">📱 Mobile Experience</a>
      <a href="#privacy" class="block text-primary hover:text-primary/80 transition-colors">🔐 Privacy and Security</a>
      <a href="#whats-next" class="block text-primary hover:text-primary/80 transition-colors">🎉 What's Next?</a>
    </nav>
  </aside>

  <!-- Main Content -->
  <article class="prose prose-slate dark:prose-invert max-w-none">
    <Markdown content={gettingStartedContent} />
  </article>

  <!-- Footer -->
  <footer class="border-t border-border pt-8 mt-12">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <p class="text-sm text-muted-foreground">
          Need more help? Check out our 
          <a href="/support" class="text-primary hover:text-primary/80">support center</a> 
          or 
          <a href="/contact" class="text-primary hover:text-primary/80">contact us</a>.
        </p>
      </div>
      
      <div class="flex gap-4 text-sm">
        <a href="/docs" class="text-muted-foreground hover:text-foreground transition-colors">Documentation</a>
        <a href="/api" class="text-muted-foreground hover:text-foreground transition-colors">API Reference</a>
        <a href="/changelog" class="text-muted-foreground hover:text-foreground transition-colors">Changelog</a>
      </div>
    </div>
  </footer>
</div>

<style>
  .getting-started-page {
    min-height: 100vh;
  }

  /* Ensure the markdown content is responsive */
  :global(.markdown-content) {
    width: 100%;
  }

  /* Style the table of contents links */
  aside nav a {
    padding-left: 1rem;
    border-left: 2px solid transparent;
    transition: border-color 0.2s ease;
  }

  aside nav a:hover {
    border-left-color: hsl(var(--primary) / 0.3);
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .getting-started-page header {
      text-align: center;
    }
    
    .getting-started-page header .flex {
      flex-direction: column;
      align-items: center;
    }
  }
</style>