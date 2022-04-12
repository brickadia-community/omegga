const { VueLoaderPlugin } = require('vue-loader');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');

const mode = process.env.NODE_ENV || 'development';

module.exports = {
  cache: { type: 'filesystem' },
  mode: mode,
  entry: {
    app: './src/webserver/frontend/app.js',
    auth: './src/webserver/frontend/auth.js',
  },
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: '[name].bundle.js',
    publicPath: '/public/',
  },
  performance: {
    hints: false,
    maxEntrypointSize: Infinity,
    maxAssetSize: Infinity,
  },
  resolve: {
    cacheWithContext: true,
    extensions: ['', '.js', '.vue'],
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        use: 'vue-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.s?css$/,
        use: [
          'vue-style-loader',
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              esModule: false,
            },
          },
          {
            loader: 'css-loader',
            options: {
              import: true,
              url: url => {
                return !url.startsWith('/public/');
              },
            },
          },
          'sass-loader',
        ],
      },
      {
        test: /\.(svg|woff2|woff|ttf|eot)$/,
        loader: 'file-loader',
        options: {
          limit: 100000,
        },
      },
    ],
  },
  plugins: [new VueLoaderPlugin(), new MiniCssExtractPlugin()],
};
