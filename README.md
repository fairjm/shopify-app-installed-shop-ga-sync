# Shopify App Install Source Sync with Google Analytics

## Project Purpose

This project provides a script to synchronize Google Analytics data with a local database to analyze the acquisition source of Shopify app installations. By leveraging the "landing page + query string" dimension in Google Analytics for the `shopify_app_install` event, this script enriches installation data with `surface_type` and `surface_detail` information, which is not natively available for all install events. This allows for a deeper understanding of user acquisition channels within the Shopify App Store, such as search terms, categories, or homepage features that lead to an install.

## Background

Shopify's app listing pages can be integrated with Google Analytics, providing two key events: `shopify_app_install` and `shopify_app_ad_click`. While these events are useful, the `shopify_app_install` event lacks the `surface_type` and `surface_detail` parameters for organic installations. This makes it difficult to determine the exact in-store source of an installation (e.g., from a search query, a category page, or the homepage).

This script was developed to overcome this limitation. By analyzing the "landing page + query string" dimension in Google Analytics for `shopify_app_install` events, we can extract the `surface_type` and `surface_detail` for each installation, providing valuable insights into user acquisition funnels.

## Features

- **Fetches App Install Data:** Connects to the Google Analytics Data API to retrieve reports on `shopify_app_install` events.
- **Enriches Installation Data:** Parses the landing page URL to extract `surface_type`, `surface_detail`, and `locale`.
- **Stores Data in MySQL:** Saves the enriched data into a MySQL database for further analysis and reporting.
- **Creates CSV Backups:** Generates a timestamped CSV backup of the synchronized data.
- **Automated Sync:** Can be run on a schedule (e.g., using a cron job) to keep the database updated.

## Prerequisites

- Node.js (v18 or higher)
- pnpm
- Access to a MySQL database
- Google Analytics 4 property set up for your Shopify App. See [Set up Google Analytics for your app listing](https://shopify.dev/docs/apps/launch/marketing/track-listing-traffic#set-up-google-analytics-for-your-app-listing).
- A Google Cloud project with the Google Analytics Data API enabled.
- A Google Cloud Service Account. To set this up and get the credentials:
  1.  **Enable the API**: In the [Google Cloud Console](https://console.cloud.google.com/), navigate to **APIs & Services > Library** and enable the **Google Analytics Data API**.
  2.  **Create a Service Account**: Go to **IAM & Admin > Service Accounts** and create a new service account.
  3.  **Generate a JSON Key**: After creating the service account, find it in the list, click the **Actions** menu (three dots), and select **Manage keys**. Click **Add Key > Create new key**, choose **JSON**, and download the key file. The content of this file is what you'll use for the `GA_CREDENTIALS_JSON` environment variable.
- **Grant Google Analytics Access**: You need to give your new service account permission to read your analytics data.
  1.  Copy the `client_email` from the downloaded JSON file.
  2.  In Google Analytics, go to **Admin > Account Access Management**.
  3.  Click the **+** icon to add a new user.
  4.  Paste the service account's email address.
  5.  Assign the **Analyst** role. Click "Add" to save.

## Installation and Configuration

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/fairjm/shopify-app-installed-shop-ga-sync.git
    cd shopify-app-installed-shop-ga-sync
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the root of the project by copying the `.env.example` file:

    ```bash
    cp .env.example .env
    ```

    Update the `.env` file with your specific credentials:

    - `GA_PROPERTY_ID`: Your Google Analytics 4 property ID.(Not the name, you can find it in the Google Analytics `Admin > Property settings > Property > Property details`)
    - `GA_CREDENTIALS_JSON`: The JSON content of your Google Cloud service account credentials.
    - `DB_HOST`: Your MySQL database host.
    - `DB_USER`: Your MySQL database username.
    - `DB_PASSWORD`: Your MySQL database password.
    - `DB_DATABASE`: The name of your MySQL database.

The default date range is set to 7 days. You can change this by modifying the `startDate` and `endDate` variables in the script.

```typescript
dateRanges: [{ startDate: "7daysAgo", endDate: "today" }];
```

## Usage

To run the synchronization script, use the following command:

```bash
pnpm ga-sync
```

This will fetch the latest data from Google Analytics for the past 7 days, process it, and update your MySQL database.

## Database Schema

The script assumes a table named `ga_app_installs` exists in your database with the following schema. You can use the following SQL statement to create it:

```sql
create table ga_app_installs
(
    id                    int auto_increment
        primary key,
    country_id            varchar(255)                        null,
    session_source_medium varchar(255)                        null,
    landing_page          text                                null,
    shop_id               varchar(255)                        null,
    shopify_gid           varchar(255) as ((case
                                                when isnull(`shop_id`) then NULL
                                                else concat('gid://shopify/Shop/', `shop_id`) end)),
    event_datetime        datetime                            null,
    event_count           int                                 null,
    locale                varchar(255)                        null,
    surface_type          varchar(255)                        null,
    surface_detail        varchar(255)                        null,
    created               timestamp default CURRENT_TIMESTAMP null,
    last_updated          timestamp default CURRENT_TIMESTAMP null on update CURRENT_TIMESTAMP,
    constraint unique_install
        unique (shop_id, event_datetime)
);
```

## Data Schema

The following fields are fetched from Google Analytics and stored in the database:

| Column                  | Description                                                                  |
| ----------------------- | ---------------------------------------------------------------------------- |
| `country_id`            | The country where the installation occurred.                                 |
| `session_source_medium` | The source and medium of the session (e.g., `google / cpc`).                 |
| `landing_page`          | The full landing page URL with query string.                                 |
| `shop_id`               | The ID of the Shopify shop that installed the app.                           |
| `event_datetime`        | The date and time of the installation event.                                 |
| `event_count`           | The number of times the event occurred.                                      |
| `locale`                | The locale from the landing page query string.                               |
| `surface_type`          | The surface type from the landing page query string (e.g., `search`).        |
| `surface_detail`        | The surface detail from the landing page query string (e.g., a search term). |
