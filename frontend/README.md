# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

## Deployment to Firebase Hosting

This frontend is deployed to Firebase Hosting. Follow these steps to deploy:

### Prerequisites

1. Install Firebase CLI (if not already installed):

   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:

   ```bash
   firebase login
   ```

3. Ensure you're using the correct Firebase project:

   ```bash
   firebase use debt-dashboard-project
   ```

### Deploy using the script

The easiest way to deploy is using the provided deployment script:

```bash
./deploy.sh
```

This script will:

- Build the React app
- Deploy to Firebase Hosting
- Output the deployment URL

### Manual deployment

If you prefer to deploy manually:

```bash
# Build the app
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

### Deployment URL

After deployment, your app will be available at:

<https://debt-dashboard-project.web.app>

### Configuration

- Firebase project: `debt-dashboard-project`
- Configuration file: `.firebaserc`
- Firebase config: `src/firebase.ts`
