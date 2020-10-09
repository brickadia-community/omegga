const { VueLoaderPlugin } = require('vue-loader');
const path = require('path');

module.exports = {
  mode: process.env.MODE || 'development',
  entry: {
    app: './src/webserver/frontend/app.js',
    auth: './src/webserver/frontend/app.js',
  },
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: '[name].bundle.js',
    publicPath: '/',
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        use: 'vue-loader',
      },
      {
        test: /\.s?css$/,
        use: [
          'vue-style-loader',
          {
            loader: 'css-loader',
            options: {
              import: true,
            },
          },
          'sass-loader',
        ],
      },
      {
        test: /favicon\.ico$/,
        loader: 'file-loader',
        query: {
          limit: 1,
          name: '[name].[ext]',
        },
      },
      {
        test: /\.(png|woff|woff2|eot|ttf|svg)$/,
        loader: 'url-loader?limit=100000',
      },
    ]
  },
  plugins: [
    new VueLoaderPlugin(),
  ],
};